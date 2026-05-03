# 📱 Mobile Debloater

ADB-based CLI to discover installed packages, select apps with interactive checkboxes, generate per-device config files, and then uninstall or disable the chosen apps.

## Features

- Interactive package discovery from the connected device
- Multi-select prompts for uninstall and disable
- Generates `config/<device-name>.js`
- Executes `adb shell pm uninstall -k --user 0` and `adb shell pm disable-user --user 0`
- Supports preset configs like `--vivo` and `--redmi`

## Prerequisites

- ADB installed and available in `PATH`
- USB debugging enabled on the phone

## Install

```bash
npm install
```

## Usage

Interactive mode:

```bash
npm run start
```

Run a saved config:

```bash
npm run start -- --config config/vivo.js
```

Use a built-in preset:

```bash
npm run start -- --vivo
```

```bash
npm run start -- --redmi
```

## Flow

1. Detect the connected device
2. Run `adb shell pm list packages`
3. Pick packages from the checkbox list
4. Resolve each selected package into `{ name, package, activity }`
5. Choose uninstall targets
6. Choose disable targets
7. Save the generated config file
8. Execute the selected actions

Generated configs are written to `config/<device-name>.js`.

## Config Format

Generated config files export both a named and default export:

```js
export const my_device = {
  deviceName: 'My Device',
  uninstall: [],
  disable: []
};

export default my_device;
```

## Notes

- Removing or disabling system apps can break device features
- Some packages are protected and can only be disabled or will fail with permissions
- If a package is selected for both uninstall and disable, uninstall wins
