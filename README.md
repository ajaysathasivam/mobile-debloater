# 📱 Mobile Debloater

An ADB-based Node.js tool to uninstall and disable bloatware apps from Android devices.

---

## 🚀 Features

* Uninstall apps for user (`--user 0`)
* Disable system / protected apps
* Brand-based configuration (Vivo, Redmi, etc.)
* Simple CLI usage with flags

---

## ⚙️ Prerequisites

Make sure you have:

* **ADB (Android Debug Bridge)** installed
* USB Debugging enabled on your phone

### Check device connection

```bash
adb devices
```

You should see your device listed as `device`.

---

## ▶️ Usage

Run the script with a brand flag:

```bash
npm run start -- --vivo
```

or

```bash
npm run start -- --redmi
```

> ⚠️ Important: Always use `--` before passing flags

---

## 📦 Project Structure

```
.
├── debloat.js
├── config/
│   ├── vivo.js
│   └── redmi.js
├── package.json
└── README.md
```

---

## 🧾 App Configuration Example

```js
export const redmi = {
  uninstall: [
    {
      name: "Google Meet",
      package: "com.google.android.apps.tachyon"
    }
  ],
  disable: [
    {
      name: "Example App",
      package: "com.example.app"
    }
  ]
};
```

> ✅ `activity` field is optional (only needed if you want to launch/debug apps)

---

## ⚠️ Warning

* Removing system apps can break device features
* Use carefully and test step by step
* Some apps cannot be uninstalled (only disabled)

---

## 🛠️ Commands Used

Uninstall:

```bash
adb shell pm uninstall -k --user 0 <package>
```

Disable:

```bash
adb shell pm disable-user --user 0 <package>
```

---

## 💡 Future Improvements

* Auto-detect device brand
* Interactive CLI (select apps)
* Backup & restore apps

---

## 📄 License

ISC License
