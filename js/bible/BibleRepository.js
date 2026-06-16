import {
    BIBLE_ERROR_CODES,
    BibleProviderError
} from './bibleErrors.js';

export class BibleRepository {
    constructor(providers = [], {
        versionResolver = versionId => versionId
    } = {}) {
        this.providers = new Map();
        this.versionResolver = versionResolver;
        providers.forEach(provider => this.registerProvider(provider));
    }

    resolveVersionId(versionId) {
        return String(
            this.versionResolver(versionId) || versionId || ''
        ).trim().toLowerCase();
    }

    registerProvider(provider) {
        const versionIds = Array.isArray(provider?.versionIds)
            ? provider.versionIds
            : [provider?.versionId];
        const normalizedVersionIds = versionIds
            .map(versionId => String(versionId || '').trim().toLowerCase())
            .filter(Boolean);

        if (!normalizedVersionIds.length || typeof provider.getChapter !== 'function') {
            throw new Error('El proveedor bíblico no implementa el contrato requerido.');
        }

        normalizedVersionIds.forEach(versionId => {
            this.providers.set(versionId, provider);
        });

        return this;
    }

    getProvider(versionId) {
        const normalizedVersionId = this.resolveVersionId(versionId);
        const provider = this.providers.get(normalizedVersionId);

        if (!provider) {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.VERSION_NOT_AVAILABLE,
                `No hay proveedor bíblico para la versión: ${versionId}`,
                { versionId: normalizedVersionId }
            );
        }

        return provider;
    }

    async getVersions() {
        const providers = [...new Set(this.providers.values())];
        const versions = [];

        for (const provider of providers) {
            if (typeof provider.getVersions === 'function') {
                const providerVersions = await provider.getVersions();

                if (!Array.isArray(providerVersions)) {
                    throw new BibleProviderError(
                        BIBLE_ERROR_CODES.INVALID_RESPONSE,
                        'El proveedor bíblico devolvió una lista de versiones inválida.'
                    );
                }

                versions.push(...providerVersions);
                continue;
            }

            versions.push(Object.freeze({
                id: provider.versionId,
                name: String(provider.versionName || provider.versionId || ''),
                abbreviation: String(provider.versionLabel || provider.versionId || '').toUpperCase(),
                language: 'es',
                source: provider.source || 'unknown',
                enabled: true,
                status: 'available'
            }));
        }

        return versions;
    }

    async getBooks(versionId) {
        return this.callProviderMethod(
            'getBooks',
            this.resolveVersionId(versionId)
        );
    }

    async getChapter(versionId, bookId, chapterNumber) {
        const resolvedVersionId = this.resolveVersionId(versionId);
        const provider = this.getProvider(resolvedVersionId);

        if (provider.acceptsVersionArgument) {
            return provider.getChapter(
                resolvedVersionId,
                bookId,
                chapterNumber
            );
        }

        return provider.getChapter(bookId, chapterNumber);
    }

    async search(versionId, query, options = {}) {
        return this.callProviderMethod(
            'search',
            this.resolveVersionId(versionId),
            query,
            options
        );
    }

    async callProviderMethod(methodName, versionId, ...args) {
        const provider = this.getProvider(versionId);
        const method = provider?.[methodName];

        if (typeof method !== 'function') {
            throw new BibleProviderError(
                BIBLE_ERROR_CODES.OPERATION_NOT_SUPPORTED,
                `La operación ${methodName} no está disponible para ${versionId}.`,
                { methodName, versionId }
            );
        }

        if (provider.acceptsVersionArgument) {
            return method.call(provider, versionId, ...args);
        }

        return method.call(provider, ...args);
    }
}
