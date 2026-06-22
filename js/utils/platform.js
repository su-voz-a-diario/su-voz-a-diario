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

export function resolveKeyboardViewportState({
    hasKeyboardFocus,
    currentHeight,
    baselineHeight,
    virtualKeyboardHeight = 0
}) {
    if (!hasKeyboardFocus) {
        return {
            keyboardOpen: false,
            heightReduction: 0,
            reductionThreshold: Math.max(120, (baselineHeight || currentHeight || 0) * 0.18)
        };
    }

    const safeCurrentHeight = Math.max(0, Number(currentHeight) || 0);
    const safeBaselineHeight = Math.max(safeCurrentHeight, Number(baselineHeight) || 0);
    const heightReduction = Math.max(0, safeBaselineHeight - safeCurrentHeight);
    const reductionThreshold = Math.max(120, safeBaselineHeight * 0.18);

    return {
        keyboardOpen: Number(virtualKeyboardHeight) > 0 || heightReduction > reductionThreshold,
        heightReduction,
        reductionThreshold
    };
}
