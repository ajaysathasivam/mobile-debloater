import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import figlet from 'figlet';
import inquirer from 'inquirer';
import { createSpinner } from 'nanospinner';
import { vivo } from './config/vivo.js';
import { redmi } from './config/redmi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, 'config');

const BUILTIN_CONFIGS = {
  vivo,
  redmi
};

function shellQuote(value) {
  return `'${String(value)}'`;
}

function runCommand(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function checkAdbConnection() {
  try {
    runCommand('adb version');
  } catch (error) {
    throw new Error('ADB is not installed or not available in PATH.');
  }

  const devicesOutput = runCommand('adb devices');
  const devices = devicesOutput
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean);

  if (devices.length === 0) {
    throw new Error('No Android device detected. Connect a device and enable USB debugging.');
  }

  const firstDevice = devices[0];

  if (firstDevice.includes('unauthorized')) {
    throw new Error('Device is unauthorized. Accept the USB debugging prompt on the phone.');
  }

  if (firstDevice.includes('offline')) {
    throw new Error('Device is offline. Reconnect USB debugging and try again.');
  }

  return firstDevice.split(/\s+/)[0];
}

function getDeviceProperty(propertyName) {
  try {
    return runCommand(`adb shell getprop ${shellQuote(propertyName)}`);
  } catch {
    return '';
  }
}

function detectDeviceName() {
  const candidates = [
    getDeviceProperty('ro.product.model'),
    getDeviceProperty('ro.product.device'),
    getDeviceProperty('ro.product.name')
  ].filter(Boolean);

  const rawName = candidates[0] || 'android-device';
  return rawName.replace(/\s+/g, ' ').trim();
}

function sanitizeFileName(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'device';
}

function toIdentifier(name) {
  const base = String(name)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return base || 'deviceConfig';
}

function prettifyPackageName(packageName) {
  const tail = packageName.split('.').filter(Boolean).pop() || packageName;
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function listInstalledPackages() {
  const output = runCommand('adb shell pm list packages');
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^package:/, ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function sortPackages(packages, sortOrder) {
  const direction = sortOrder === 'desc' ? -1 : 1;
  const sorted = [...packages].sort((a, b) => {
    const leftRank = getPackageRank(a);
    const rightRank = getPackageRank(b);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftSubRank = getPackageSubRank(a);
    const rightSubRank = getPackageSubRank(b);

    if (leftSubRank !== rightSubRank) {
      return leftSubRank - rightSubRank;
    }

    return a.localeCompare(b) * direction;
  });
 
  return sorted;
}

function getPackageRank(packageName) {
  if (packageName.startsWith('com.')) {
    return 0;
  }

  if (packageName === 'org.videolan.vlc') {
    return 1;
  }

  return 2;
}

function getPackageSubRank(packageName) {
  if (packageName === 'com.whatsapp') {
    return 0;
  }

  if (packageName === 'org.videolan.vlc') {
    return 0;
  }

  return 1;
}

function filterPackages(packages, searchTerm) {
  const query = searchTerm.trim().toLowerCase();

  if (!query) {
    return packages;
  }

  return packages.filter(pkg => {
    const label = prettifyPackageName(pkg).toLowerCase();
    return pkg.toLowerCase().includes(query) || label.includes(query);
  });
}

function extractLabel(dumpsysOutput, packageName) {
  const labelMatch = dumpsysOutput.match(/application-label(?:-[^:]+)?:'([^']+)'/i);
  if (labelMatch?.[1]) {
    return labelMatch[1].trim();
  }

  const fallbackMatch = dumpsysOutput.match(/application-label(?:-[^:]+)?:\s*([^\n\r]+)/i);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].trim().replace(/^"|"$/g, '');
  }

  return prettifyPackageName(packageName);
}

function extractActivity(resolveOutput) {
  const lines = resolveOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.includes('/')) {
      const resolved = line.split('/').slice(1).join('/').trim();
      if (resolved && !resolved.toLowerCase().includes('no activity')) {
        return resolved;
      }
    }
  }

  const lastLine = lines.at(-1) || '';
  if (lastLine && !lastLine.toLowerCase().includes('no activity')) {
    return lastLine.includes('/') ? lastLine.split('/').at(-1).trim() : lastLine;
  }

  return null;
}

function resolveSelectedApp(packageName) {
  let label = prettifyPackageName(packageName);
  let activity = null;

  try {
    const dumpsysOutput = runCommand(`adb shell dumpsys package ${shellQuote(packageName)}`);
    label = extractLabel(dumpsysOutput, packageName);
  } catch {
    label = prettifyPackageName(packageName);
  }

  try {
    const resolveOutput = runCommand(`adb shell cmd package resolve-activity --brief ${shellQuote(packageName)}`);
    activity = extractActivity(resolveOutput);
  } catch {
    activity = null;
  }

  return {
    name: label,
    package: packageName,
    activity
  };
}

function normalizeAppList(apps) {
  return apps
    .filter(Boolean)
    .map(app => ({
      name: app.name || prettifyPackageName(app.package || ''),
      package: app.package,
      activity: app.activity ?? null
    }))
    .filter(app => app.package);
}

function normalizeConfig(config) {
  const uninstall = normalizeAppList(config?.uninstall ?? []);
  const uninstallPackages = new Set(uninstall.map(app => app.package));
  const disable = normalizeAppList(config?.disable ?? []).filter(app => !uninstallPackages.has(app.package));

  return {
    deviceName: config?.deviceName ?? null,
    uninstall,
    disable
  };
}

function formatConfigModule(exportName, config) {
  return [
    `export const ${exportName} = ${JSON.stringify(config, null, 2)};`,
    '',
    `export default ${exportName};`,
    ''
  ].join('\n');
}

async function saveConfigFile(deviceName, config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  const fileBase = sanitizeFileName(deviceName);
  const exportName = toIdentifier(fileBase);
  const filePath = path.join(CONFIG_DIR, `${fileBase}.js`);
  const payload = {
    deviceName,
    ...config
  };

  await fs.writeFile(filePath, formatConfigModule(exportName, payload), 'utf8');
  return filePath;
}

async function loadConfigFromFile(configPath) {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  const moduleUrl = pathToFileURL(resolvedPath).href;
  const module = await import(moduleUrl);

  return normalizeConfig(module.default ?? module.config ?? module.vivo ?? module.redmi ?? module);
}

function printBanner() {
  console.log(figlet.textSync('DEBLOAT', {
    horizontalLayout: 'default',
    verticalLayout: 'default'
  }));
  console.log('ADB debloat CLI with package discovery, config generation, and execution.\n');
}

async function askForPackages(packages) {
  const { searchTerm, sortOrder } = await inquirer.prompt([
    {
      type: 'input',
      name: 'searchTerm',
      message: 'Search packages by app name or package id',
      default: ''
    },
    {
      type: 'list',
      name: 'sortOrder',
      message: 'Sort packages',
      choices: [
        { name: 'A to Z', value: 'asc' },
        { name: 'Z to A', value: 'desc' }
      ],
      default: 'asc'
    }
  ]);

  const filteredPackages = sortPackages(filterPackages(packages, searchTerm), sortOrder);

  if (filteredPackages.length === 0) {
    console.log('No packages matched your search.');
    return [];
  }

  const { selectedPackages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedPackages',
      message: 'Select packages to inspect and manage',
      choices: filteredPackages.map(pkg => ({
        name: pkg,
        value: pkg
      })),
      pageSize: 20
    }
  ]);

  return selectedPackages;
}

async function askForAction(apps, actionName) {
  if (apps.length === 0) {
    return [];
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: `Which of these should be marked for ${actionName}?`,
      choices: apps.map(app => ({
        name: `${app.package}${app.activity ? ` | ${app.activity}` : ''}`,
        value: app.package
      })),
      pageSize: 20
    }
  ]);

  return apps.filter(app => selected.includes(app.package));
}

function runAdbAction(app, actionType, adbArgs) {
  const command = `adb shell pm ${adbArgs} ${shellQuote(app.package)}`;

  try {
    const stdout = runCommand(command);
    if (/failure|error/i.test(stdout)) {
      throw new Error(stdout);
    }

    console.log(`  ✓ ${actionType}: ${app.name} (${app.package})`);
  } catch (error) {
    const message = String(error?.stderr || error?.message || error || '').trim();
    console.log(`  ✗ ${actionType}: ${app.name} (${app.package})`);

    if (/not installed for 0|Unknown package/i.test(message)) {
      console.warn('    App is already removed or does not exist for this user.');
      return;
    }

    if (/Permission denied|SecurityException/i.test(message)) {
      console.warn('    The device blocked this protected package.');
      return;
    }

    console.warn(`    ${message || 'Unknown ADB failure.'}`);
  }
}

function executeConfig(config) {
  const normalized = normalizeConfig(config);

  if (normalized.uninstall.length === 0 && normalized.disable.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  if (normalized.uninstall.length > 0) {
    const spinner = createSpinner(`Uninstalling ${normalized.uninstall.length} package(s)`).start();
    normalized.uninstall.forEach(app => runAdbAction(app, 'UNINSTALL', 'uninstall -k --user 0'));
    spinner.success({ text: 'Uninstall phase complete' });
  }

  if (normalized.disable.length > 0) {
    const spinner = createSpinner(`Disabling ${normalized.disable.length} package(s)`).start();
    normalized.disable.forEach(app => runAdbAction(app, 'DISABLE', 'disable-user --user 0'));
    spinner.success({ text: 'Disable phase complete' });
  }
}

async function interactiveFlow() {
  printBanner();

  const deviceSpinner = createSpinner('Checking ADB connection').start();
  const serial = checkAdbConnection();
  const deviceName = detectDeviceName();
  deviceSpinner.success({ text: `Connected to ${deviceName} (${serial})` });

  const packagesSpinner = createSpinner('Listing installed packages').start();
  const packages = listInstalledPackages();
  packagesSpinner.success({ text: `Found ${packages.length} packages` });

  if (packages.length === 0) {
    console.log('No packages were found on the connected device.');
    return;
  }

  const selectedPackages = await askForPackages(packages);

  if (selectedPackages.length === 0) {
    console.log('No packages selected. Exiting.');
    return;
  }

  const detailsSpinner = createSpinner('Resolving app names and activities').start();
  const selectedApps = selectedPackages.map(resolveSelectedApp);
  detailsSpinner.success({ text: 'Resolved selected apps' });

  const uninstallApps = await askForAction(selectedApps, 'uninstall');
  const disableApps = await askForAction(selectedApps, 'disable');

  const config = normalizeConfig({
    deviceName,
    uninstall: uninstallApps,
    disable: disableApps
  });

  if (config.uninstall.length === 0 && config.disable.length === 0) {
    console.log('No actions were selected. Exiting.');
    return;
  }

  const saveSpinner = createSpinner(`Saving config/${sanitizeFileName(deviceName)}.js`).start();
  const configPath = await saveConfigFile(deviceName, config);
  saveSpinner.success({ text: `Saved ${path.relative(process.cwd(), configPath)}` });

  console.log('\nPreview');
  console.log('-------');
  console.log(JSON.stringify(config, null, 2));
  console.log('');

  executeConfig(config);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    configPath: null,
    preset: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--config' || arg === '-c') {
      result.configPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--vivo') {
      result.preset = 'vivo';
    }

    if (arg === '--redmi') {
      result.preset = 'redmi';
    }
  }

  return result;
}

export {
  checkAdbConnection,
  executeConfig,
  interactiveFlow,
  loadConfigFromFile,
  normalizeConfig,
  resolveSelectedApp,
  saveConfigFile
};

async function main() {
  const { configPath, preset } = parseArgs(process.argv);

  if (configPath) {
    printBanner();
    const deviceSpinner = createSpinner('Checking ADB connection').start();
    const serial = checkAdbConnection();
    const deviceName = detectDeviceName();
    deviceSpinner.success({ text: `Connected to ${deviceName} (${serial})` });

    const loadSpinner = createSpinner(`Loading ${configPath}`).start();
    const config = await loadConfigFromFile(configPath);
    loadSpinner.success({ text: `Loaded ${configPath}` });
    executeConfig(config);
    return;
  }

  if (preset && BUILTIN_CONFIGS[preset]) {
    printBanner();
    const deviceSpinner = createSpinner('Checking ADB connection').start();
    const serial = checkAdbConnection();
    const deviceName = detectDeviceName();
    deviceSpinner.success({ text: `Connected to ${deviceName} (${serial})` });

    executeConfig(BUILTIN_CONFIGS[preset]);
    return;
  }

  await interactiveFlow();
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  main().catch(error => {
    console.error('\nFatal error:', error.message || error);
    process.exit(1);
  });
}
