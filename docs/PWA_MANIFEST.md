# PWA Manifest & Configuration

## What is a PWA Manifest?

A **PWA Manifest** (Progressive Web App Manifest) is a JSON configuration file that tells browsers and operating systems how to treat your web application when users install it on their device. Think of it as an instruction manual that describes what your app is called, what icon to use on the home screen, what colors to apply to the title bar, and how the app should behave when launched—essentially transforming a website into something that feels and acts like a native mobile or desktop application.

The manifest file, typically named `manifest.json`, is what enables the "installability" of Progressive Web Apps. When a user visits a PWA that meets certain criteria (has a manifest, runs over HTTPS, includes a Service Worker), browsers display an "Install" prompt allowing users to add the app to their home screen or application menu. Once installed, the app can launch in its own window without browser UI, display a custom splash screen while loading, and appear in the operating system's task switcher alongside native apps. The manifest is a simple JSON file but has a profound impact—it's the difference between a website that only works in a browser tab and a web app that feels native.

## What Goes in the Manifest?

The manifest defines your app's **identity** (name, description), **appearance** (colors, icons, display mode), and **behavior** (start URL, orientation, scope). Let's break down PushFlow's manifest structure and understand what each field controls.

## manifest.json Structure

```json
{
  "name": "PushFlow - Web Push Notification System",
  "short_name": "PushFlow",
  "description": "Send real-time push notifications across all your devices with Web Push API and Service Workers",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#1f6feb",
  "orientation": "portrait-primary",
  "scope": "/",
  "lang": "en-US",
  "dir": "ltr",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-512x512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/images/screenshot-desktop.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "PushFlow Desktop UI"
    },
    {
      "src": "/images/screenshot-mobile.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "PushFlow Mobile UI"
    }
  ]
}
```

## Field Explanations

### Core Identity

#### name

```json
"name": "PushFlow - Web Push Notification System"
```

- **Purpose:** Full application name
- **Used:** Install prompt, app drawer, task switcher
- **Max Length:** 45 characters (longer gets truncated)
- **Best Practice:** Descriptive, includes keywords

#### short_name

```json
"short_name": "PushFlow"
```

- **Purpose:** Short label for limited space
- **Used:** Home screen icon label, app launcher
- **Max Length:** 12 characters
- **Best Practice:** 1-2 words, memorable

#### description

```json
"description": "Send real-time push notifications across all your devices"
```

- **Purpose:** Brief explanation of app functionality
- **Used:** App listings, search results, install dialogs
- **Max Length:** 200 characters
- **Best Practice:** Clear, action-oriented

### Display Configuration

#### start_url

```json
"start_url": "/"
```

- **Purpose:** URL loaded when app launches
- **Options:**
  - `/` - Root (most common)
  - `/?source=pwa` - Track PWA launches
  - `/app/dashboard` - Deep link
- **Scope:** Must be within `scope`

#### display

```json
"display": "standalone"
```

| Mode         | Browser UI | Status Bar | Back Button | Use Case         |
| ------------ | ---------- | ---------- | ----------- | ---------------- |
| `fullscreen` | None       | Hidden     | None        | Games, immersive |
| `standalone` | None       | Visible    | System      | Most PWAs        |
| `minimal-ui` | Minimal    | Visible    | System      | News apps        |
| `browser`    | Full       | Visible    | Browser     | Fallback         |

**PushFlow:** `standalone` for native app feel

#### scope

```json
"scope": "/"
```

- **Purpose:** Navigation boundaries
- **Behavior:** URLs outside scope open in browser
- **Examples:**
  - `/` - Entire site
  - `/app/` - Only /app/\* routes
- **Fallback:** If omitted, uses `start_url` directory

#### orientation

```json
"orientation": "portrait-primary"
```

| Value                 | Behavior              |
| --------------------- | --------------------- |
| `portrait-primary`    | Portrait, natural     |
| `portrait-secondary`  | Portrait, upside-down |
| `landscape-primary`   | Landscape, natural    |
| `landscape-secondary` | Landscape, rotated    |
| `portrait`            | Portrait, any         |
| `landscape`           | Landscape, any        |
| `any`                 | No lock (default)     |

**PushFlow:** `portrait-primary` for messaging UI

### Visual Styling

#### background_color

```json
"background_color": "#0d1117"
```

- **Purpose:** Splash screen background
- **Timing:** Shows while app loads
- **Best Practice:** Match app's primary background
- **Format:** Hex, RGB, named colors

#### theme_color

```json
"theme_color": "#1f6feb"
```

- **Purpose:** Browser chrome color (toolbar, status bar)
- **Used:** Task switcher, address bar (mobile)
- **Platform Differences:**
  - Android: Status bar, nav bar, task switcher
  - iOS: Minimal effect (limited PWA support)
  - Desktop: Window title bar (Windows 11)
- **Best Practice:** Match app's primary color

### Localization

#### lang

```json
"lang": "en-US"
```

- **Purpose:** Primary language of app
- **Format:** BCP 47 language tag
- **Examples:** `en`, `en-US`, `es-ES`, `fr-FR`

#### dir

```json
"dir": "ltr"
```

- **Values:**
  - `ltr` - Left-to-right (English, Spanish, French)
  - `rtl` - Right-to-left (Arabic, Hebrew)
  - `auto` - Auto-detect from content

## Icons Configuration

### Icon Sizes & Purposes

```json
{
  "src": "/icons/icon-192x192.png",
  "sizes": "192x192",
  "type": "image/png",
  "purpose": "any"
}
```

#### Required Sizes

| Size        | Use Case                | Platform      |
| ----------- | ----------------------- | ------------- |
| 72x72       | Older devices           | Android       |
| 96x96       | Low-density screens     | Android       |
| 128x128     | Chrome desktop          | Windows, Mac  |
| 144x144     | High-density screens    | Android       |
| 152x152     | iPad                    | iOS (limited) |
| **192x192** | **Minimum recommended** | **All**       |
| 384x384     | xxhdpi screens          | Android       |
| **512x512** | **Splash screens**      | **All**       |

#### Purpose Attribute

##### any (Standard Icons)

```json
"purpose": "any"
```

- **Usage:** Home screen, task switcher, app drawer
- **Design:** Full bleed (icon edge to edge)
- **Safe Zone:** None required
- **Background:** Can be transparent

##### maskable (Adaptive Icons)

```json
"purpose": "maskable"
```

- **Usage:** Android 8+ adaptive icons
- **Design:** Icon centered with safe zone
- **Safe Zone:** 40% diameter circle in center
- **Background:** Must be opaque (no transparency)

**Example:**

```
┌─────────────────┐
│                 │  ← Padding (may be masked)
│    ┌─────┐     │
│    │ ICON │    │  ← Safe zone (always visible)
│    └─────┘     │
│                 │  ← Padding (may be masked)
└─────────────────┘
```

#### Icon Formats

| Format | Support            | Transparency | Animation | File Size |
| ------ | ------------------ | ------------ | --------- | --------- |
| PNG    | ✅ All             | ✅ Yes       | ❌ No     | Medium    |
| SVG    | ⚠️ Limited         | ✅ Yes       | ❌ No     | Small     |
| WebP   | ⚠️ Limited         | ✅ Yes       | ❌ No     | Smallest  |
| ICO    | ❌ Not recommended | ⚠️ Limited   | ❌ No     | Large     |

**Best Practice:** PNG for maximum compatibility

### Generating Icons

#### From SVG (Recommended)

```bash
# Install ImageMagick
brew install imagemagick  # macOS
apt install imagemagick   # Ubuntu

# Generate all sizes
for size in 72 96 128 144 152 192 384 512; do
  convert icon.svg -resize ${size}x${size} icon-${size}x${size}.png
done

# Generate maskable (with padding)
for size in 192 512; do
  convert icon.svg -resize $(($size*8/10))x$(($size*8/10)) \
    -gravity center -extent ${size}x${size} \
    -background "#1f6feb" icon-${size}x${size}-maskable.png
done
```

#### Online Tools

- [RealFaviconGenerator](https://realfavicongenerator.net/) - Comprehensive
- [Maskable.app](https://maskable.app/) - Preview maskable icons
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) - CLI tool

#### Manual Photoshop/Figma

1. Create 512x512 canvas
2. Design icon centered
3. Export each size individually
4. For maskable: Add 80px padding around 400x400 icon

## Screenshots

```json
{
  "src": "/images/screenshot-desktop.png",
  "sizes": "1280x720",
  "type": "image/png",
  "form_factor": "wide",
  "label": "PushFlow Desktop UI"
}
```

### Purpose

- **Used:** Install prompts (Chrome 90+), app listings
- **Impact:** 20-30% increase in install rate
- **Required:** Not mandatory but highly recommended

### form_factor

| Value    | Aspect Ratio | Devices          | Min Size |
| -------- | ------------ | ---------------- | -------- |
| `wide`   | 16:9, 16:10  | Desktop, tablets | 1280x720 |
| `narrow` | 9:16, 10:16  | Phones           | 750x1334 |

### Best Practices

1. **Include both form factors** - Desktop and mobile
2. **Show core functionality** - Not splash screens
3. **Use actual app UI** - Not mockups
4. **High resolution** - Retina quality
5. **2-5 screenshots** - Don't overdo it
6. **Descriptive labels** - Explain what's shown

### Example Screenshots

```json
"screenshots": [
  {
    "src": "/images/screenshot-send.png",
    "sizes": "1280x720",
    "type": "image/png",
    "form_factor": "wide",
    "label": "Send notifications to all your devices"
  },
  {
    "src": "/images/screenshot-devices.png",
    "sizes": "1280x720",
    "type": "image/png",
    "form_factor": "wide",
    "label": "Manage connected devices"
  },
  {
    "src": "/images/screenshot-mobile-send.png",
    "sizes": "750x1334",
    "type": "image/png",
    "form_factor": "narrow",
    "label": "Mobile-optimized UI"
  }
]
```

## HTML Integration

```html
<!DOCTYPE html>
<html lang="en-US">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- PWA Manifest -->
    <link rel="manifest" href="/manifest.json" />

    <!-- Theme Color (duplicate from manifest for older browsers) -->
    <meta name="theme-color" content="#1f6feb" />

    <!-- iOS Specific (PWA support limited) -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="PushFlow" />
    <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />

    <!-- Windows Tiles (Legacy) -->
    <meta name="msapplication-TileColor" content="#1f6feb" />
    <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />

    <!-- Favicon (Fallback) -->
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />

    <title>PushFlow - Web Push Notification System</title>
  </head>
  <body>
    <!-- App content -->
  </body>
</html>
```

### Meta Tags Priority

1. **`<link rel="manifest">`** - Primary PWA config
2. **`<meta name="theme-color">`** - Fallback for older browsers
3. **Apple tags** - iOS limited support
4. **MS tags** - Legacy Windows tiles
5. **Favicons** - Browser tab icons

## iOS PWA Limitations

### Limited Support

- ❌ No push notifications (before iOS 16.4)
- ⚠️ Push notifications (iOS 16.4+) - limited
- ❌ No background sync
- ❌ No badging API
- ⚠️ Service Worker limited
- ✅ Add to Home Screen works

### iOS-Specific Meta Tags

```html
<!-- Enable PWA mode -->
<meta name="apple-mobile-web-app-capable" content="yes" />

<!-- Status bar style -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<!-- Options: default, black, black-translucent -->

<!-- App title on home screen -->
<meta name="apple-mobile-web-app-title" content="PushFlow" />

<!-- App icon (required) -->
<link rel="apple-touch-icon" href="/icons/icon-180x180.png" />

<!-- Splash screen (optional, deprecated) -->
<link rel="apple-touch-startup-image" href="/splash.png" />
```

### iOS Icon Requirements

- **Size:** 180x180px (minimum)
- **Format:** PNG
- **Transparency:** Removed automatically (iOS adds rounded corners)
- **Design:** Full bleed (no safe zone needed)

## Validation & Testing

### Manifest Validation

```bash
# Lighthouse audit
npx lighthouse https://yoursite.com --view

# Check specific PWA criteria
npx lighthouse https://yoursite.com --preset=pwa --view
```

### Chrome DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Manifest** in sidebar
4. Verify all fields parsed correctly
5. Check **Icons** section for all sizes
6. Click **Errors and warnings** for issues

### Common Errors

#### Manifest not found

```
Failed to load manifest: No manifest found at /manifest.json
```

**Fix:** Check `<link rel="manifest" href="/manifest.json">` path

#### Invalid JSON

```
Manifest: Line 5, column 4, Syntax error.
```

**Fix:** Validate JSON at [jsonlint.com](https://jsonlint.com/)

#### Icons not loading

```
Manifest: property 'icons[0].src' ignored, URL is invalid.
```

**Fix:** Use absolute paths (`/icons/icon.png`) or full URLs

#### start_url outside scope

```
Manifest: property 'start_url' ignored, must be same origin as document.
```

**Fix:** Ensure `start_url` within `scope`

### Testing Install

#### Desktop (Chrome)

1. Open DevTools → Application → Manifest
2. Click **Update** to reload manifest
3. Click **Install** button in address bar
4. Verify app installs to OS

#### Mobile (Android)

1. Open site in Chrome
2. Tap **Add to Home Screen** in menu
3. Verify app installs
4. Launch from home screen
5. Check standalone mode (no browser UI)

#### Mobile (iOS)

1. Open site in Safari
2. Tap **Share** button
3. Select **Add to Home Screen**
4. Verify icon and name
5. Launch from home screen

## Advanced Configuration

### Dynamic Manifest

```javascript
// server.mjs
app.get('/manifest.json', (req, res) => {
  const manifest = {
    name: 'PushFlow',
    short_name: 'PushFlow',
    start_url: '/?source=pwa',
    display: 'standalone',
    theme_color: req.query.theme === 'light' ? '#ffffff' : '#0d1117',
    // ... rest of manifest
  };

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(manifest));
});
```

### Service Worker Registration

```javascript
// app.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // Always check for updates
      });

      console.log('SW registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('SW update found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('New SW available, please refresh');
            // Show update notification
          }
        });
      });
    } catch (error) {
      console.error('SW registration failed:', error);
    }
  });
}
```

### Install Prompt Control

```javascript
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent automatic prompt
  e.preventDefault();

  // Store event for later
  deferredPrompt = e;

  // Show custom install button
  document.getElementById('install-button').style.display = 'block';
});

document.getElementById('install-button').addEventListener('click', async () => {
  if (!deferredPrompt) return;

  // Show install prompt
  deferredPrompt.prompt();

  // Wait for user choice
  const { outcome } = await deferredPrompt.userChoice;
  console.log('User choice:', outcome); // 'accepted' or 'dismissed'

  // Clear the prompt
  deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
  console.log('PWA installed successfully');
  deferredPrompt = null;
});
```

### Standalone Mode Detection

```javascript
// Check if running as installed PWA
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone || // iOS
  document.referrer.includes('android-app://'); // Android TWA

if (isStandalone) {
  console.log('Running as installed PWA');
  // Hide install prompt, enable PWA-only features
}

// Listen for changes
window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
  if (e.matches) {
    console.log('Switched to standalone mode');
  }
});
```

## Best Practices Checklist

- ✅ **manifest.json** in root directory
- ✅ **`<link rel="manifest">`** in HTML head
- ✅ **name** and **short_name** descriptive
- ✅ **start_url** and **scope** configured
- ✅ **display: "standalone"** for app-like feel
- ✅ **theme_color** and **background_color** match design
- ✅ **Icons**: 192x192 and 512x512 minimum
- ✅ **Maskable icons** for Android 8+
- ✅ **Screenshots** for install prompt
- ✅ **Service Worker** registered
- ✅ **HTTPS** required (except localhost)
- ✅ **iOS meta tags** for Apple devices
- ✅ **Lighthouse PWA audit** passes
- ✅ **Install prompt** tested on multiple devices
- ✅ **Offline support** via Service Worker

## References

- [MDN Web App Manifests](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [Maskable Icons](https://web.dev/maskable-icon/)
- [Chrome Install Criteria](https://web.dev/install-criteria/)
- [iOS PWA Support](https://firt.dev/ios-16.4/)
