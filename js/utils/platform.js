export function isRunningAsInstalledPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
}

export function getPlatformLabel() {
    if (isIOSDevice()) return 'ios';
    if (isAndroidDevice()) return 'android';
    return 'web';
}
