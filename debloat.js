import { execSync } from 'child_process';
import { vivo } from './config/vivo.js';
import { redmi } from './config/redmi.js';

const args = process.argv;

const isVivo = args.includes('--vivo');
const isRedmi = args.includes('--redmi')
// ==================== CONFIGURATION ====================
// Add the package names you want to manage here
const APPS_TO_UNINSTALL = [
  ...(isVivo ? vivo.uninstall : []),
  ...(isRedmi ? redmi.uninstall : []),
]
const APPS_TO_DISABLE = [
  ...(isVivo ? vivo.disable : []),
  ...(isRedmi ? redmi.disable : [])
]
// ========================================================

/**
 * Checks if ADB is installed and a device is properly connected and authorized.
 */
function checkAdbConnection() {
  try {
    // 1. Check if adb command exists on the Linux system
    execSync('which adb', { stdio: 'pipe' });
  } catch (error) {
    console.error('❌ Error: ADB is not installed on this Linux system.');
    console.error('👉 Run: sudo apt install android-tools-adb (or your distro equivalent)');
    process.exit(1);
  }

  try {
    // 2. Check connected devices
    const devicesOutput = execSync('adb devices', { encoding: 'utf8' });
    const lines = devicesOutput.trim().split('\n').slice(1); // Remove the header line

    const devices = lines
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (devices.length === 0) {
      console.error('❌ Error: No Android device detected.');
      console.error('👉 Please connect your phone via USB and enable USB Debugging.');
      process.exit(1);
    }

    const firstDevice = devices[0];
    if (firstDevice.includes('unauthorized')) {
      console.error('❌ Error: Device is unauthorized.');
      console.error('👉 Please check your phone screen and tap "Allow USB Debugging".');
      process.exit(1);
    }

    if (firstDevice.includes('offline')) {
      console.error('❌ Error: Device is offline. Try toggling USB Debugging off and on.');
      process.exit(1);
    }

    console.log('✅ ADB connected and authorized successfully.\n');
  } catch (error) {
    console.error('❌ Error: Failed to communicate with ADB.', error.message);
    process.exit(1);
  }
}

/**
 * Executes an ADB shell command and handles specific error cases.
 */
function runAdbCommand(packageName, commandType, adbArgs) {
  const command = `adb shell pm ${adbArgs} ${packageName}`;

  try {
    const stdout = execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();

    // Check for silent or non-throwing failures that return specific text
    if (stdout.toLowerCase().includes('failure') || stdout.toLowerCase().includes('error')) {
      throw new Error(stdout);
    }

    console.log(`  └─ [SUCCESS] ${commandType}: ${packageName}`);
  } catch (error) {
    const errorMsg = error.stderr || error.message || '';

    console.log(`  └─ [FAILED] ${commandType}: ${packageName}`);

    // Categorize specific ADB errors
    if (errorMsg.includes('not installed for 0') || errorMsg.includes('Unknown package')) {
      console.warn(`     ⚠️  Reason: App is already uninstalled or does not exist.`);
    } else if (errorMsg.includes('Permission denied') || errorMsg.includes('SecurityException')) {
      console.warn(`     ⚠️  Reason: Permission issue. The system prevents removing/disabling this protected app.`);
    } else {
      console.warn(`     ⚠️  Reason: ${errorMsg.replace(/\n/g, ' ').trim()}`);
    }
  }
}

// ==================== MAIN EXECUTION ====================

function main() {
  console.log('===================================================');
  console.log('📱 Starting Debloat Automation 📱');
  console.log('===================================================\n');

  // Step 1: Pre-flight checks
  checkAdbConnection();

  // Step 2: Handle uninstalls
  if (APPS_TO_UNINSTALL.length > 0) {
    console.log(`🧹 Processing Uninstall List (${APPS_TO_UNINSTALL.length} apps)...`);
    APPS_TO_UNINSTALL.forEach(pkg => {
      console.log(pkg.name)
      runAdbCommand(pkg.package, 'UNINSTALL', 'uninstall -k --user 0');
    });
    console.log('');
  }

  // Step 3: Handle disables
  if (APPS_TO_DISABLE.length > 0) {
    console.log(`🔒 Processing Disable List (${APPS_TO_DISABLE.length} apps)...`);
    APPS_TO_DISABLE.forEach(pkg => {
      console.log(pkg.name)
      runAdbCommand(pkg.name, 'DISABLE', 'disable-user --user 0');
    });
    console.log('');
  }

  console.log('===================================================');
  console.log('🎉 Clean-up execution completed.');
  console.log('===================================================');
}

main();
