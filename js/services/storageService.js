export function get(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`[Storage] Error leyendo ${key}:`, error);
        return fallback;
    }
}

export function set(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`[Storage] Error guardando ${key}:`, error);
        return false;
    }
}

export function remove(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error(`[Storage] Error eliminando ${key}:`, error);
    }
}
