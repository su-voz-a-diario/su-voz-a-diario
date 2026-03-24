const App = {
    data: [],
    currentView: 'home',
    today: new Date(),
    openNoteDate: null,
    noteSavedMessageDate: null,
    readingMode: false,
    
    // --- Futuras Funciones (Stubs) ---
    // Guardar estado de lectura localmente
    markAsRead: function (dateStr) {
        let readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        if (!readDates.includes(dateStr)) {
            readDates.push(dateStr);
            localStorage.setItem('su-voz-read-dates', JSON.stringify(readDates));
        }
    },
    isRead: function (dateStr) {
        let readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        return readDates.includes(dateStr);
    },
    getHighlightsKey: function (dateStr) {
    return `su-voz-highlights-${dateStr}`;
},
getHighlights: function (dateStr) {
    return JSON.parse(localStorage.getItem(this.getHighlightsKey(dateStr))) || [];
},
hasHighlights: function (dateStr) {
    return this.getHighlights(dateStr).length > 0;
},
saveHighlights: function (dateStr, highlights) {
    localStorage.setItem(this.getHighlightsKey(dateStr), JSON.stringify(highlights));
},
getNoteKey: function (dateStr) {
    return `su-voz-note-${dateStr}`;
},
getNote: function (dateStr) {
    return localStorage.getItem(this.getNoteKey(dateStr)) || '';
},
hasNote: function (dateStr) {
    return this.getNote(dateStr).trim().length > 0;
},
saveNote: function (dateStr, noteText) {
    localStorage.setItem(this.getNoteKey(dateStr), noteText);
},
deleteNote: function (dateStr) {
    localStorage.removeItem(this.getNoteKey(dateStr));
},
toggleNote: function (dateStr) {
    this.openNoteDate = this.openNoteDate === dateStr ? null : dateStr;
},
resetReadingMode: function () {
    this.readingMode = false;
    document.body.classList.remove('reading-mode');
},
showNoteSavedMessage: function (dateStr) {
    this.noteSavedMessageDate = dateStr;

    clearTimeout(this.noteSavedTimeout);

    this.noteSavedTimeout = setTimeout(() => {
        this.noteSavedMessageDate = null;
        if (this.currentView === 'reading') {
            this.renderReading(dateStr);
        }
    }, 1200);
},
escapeRegExp: function (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
},
applyHighlightsToHtml: function (html, highlights) {
    let result = html;

    highlights.forEach(text => {
        if (!text || !text.trim()) return;

        const escaped = this.escapeRegExp(text.trim());

        result = result.replace(
            new RegExp(`(${escaped})(?![^<]*>|[^<>]*<\\/mark>)`),
            '<mark class="user-highlight">$1</mark>'
        );
    });

    return result;
},
removeHighlightButton: function () {
    const existing = document.getElementById('highlight-btn');
    if (existing) existing.remove();
},
showHighlightButton: function (selection, dateStr) {
    this.removeHighlightButton();

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const btn = document.createElement('button');
    btn.id = 'highlight-btn';
    btn.className = 'highlight-btn';
    btn.textContent = 'Resaltar';

    btn.style.top = `${window.scrollY + rect.top - 45}px`;
    btn.style.left = `${window.scrollX + rect.left}px`;

    btn.addEventListener('click', () => {
        const highlights = this.getHighlights(dateStr);

        if (!highlights.includes(selectedText)) {
            highlights.push(selectedText);
            this.saveHighlights(dateStr, highlights);
        }

        selection.removeAllRanges();
        this.removeHighlightButton();
        this.renderReading(dateStr);
    });

    document.body.appendChild(btn);
},
    // ----------------------------------

    init: async function () {
        this.cacheDOM();
        this.resetReadingMode();
        this.initTheme();
        this.bindEvents();
        await this.loadData();
        this.handleRoute();
    },

    cacheDOM: function () {
        this.$content = document.getElementById('app-content');
        this.$navHome = document.getElementById('nav-home');
        this.$navCalendar = document.getElementById('nav-calendar');
    },

    initTheme: function () {
    const savedTheme = localStorage.getItem('theme');
    const toggleBtn = document.getElementById('theme-toggle');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
        if (toggleBtn) toggleBtn.textContent = '☀️';
    } else if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
        if (toggleBtn) toggleBtn.textContent = '🌙';
    } else {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (toggleBtn) toggleBtn.textContent = systemDark ? '☀️' : '🌙';
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark-mode');

            if (isDark) {
                document.body.classList.remove('dark-mode');
                document.body.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
                toggleBtn.textContent = '🌙';
            } else {
                document.body.classList.remove('light-mode');
                document.body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark');
                toggleBtn.textContent = '☀️';
            }
        });
    }
},
  bindEvents: function () {
    this.$navHome.addEventListener('click', () => this.navigate('home'));
    this.$navCalendar.addEventListener('click', () => this.navigate('calendar'));
    window.addEventListener('popstate', () => this.handleRoute());

   this.$content.addEventListener('click', (e) => {
       if (e.target.closest('.reading-text')) {
            this.readingMode = !this.readingMode;
            document.body.classList.toggle('reading-mode', this.readingMode);
            this.renderReading(window.location.hash.split('/')[1]);
            return;
        }
        
       if (e.target.closest('[data-action="exit-reading-mode"]')) {
            this.readingMode = false;
            document.body.classList.remove('reading-mode');
            this.renderReading(window.location.hash.split('/')[1]);
            return;
        }
        
        // Marcar como leído
        if (e.target.closest('[data-action="mark-read"]')) {
            const date = e.target.closest('[data-action="mark-read"]').getAttribute('data-date');
            this.markAsRead(date);
            this.renderReading(date);
            return;
        }

        // Compartir lectura
        if (e.target.closest('[data-action="share-reading"]')) {
            const date = e.target.closest('[data-action="share-reading"]').getAttribute('data-date');
            const reading = this.data.find(r => r.date === date);

            if (!reading) return;

            const cleanText = reading.text.replace(/<[^>]+>/g, '');

            const shareText = `Su voz a diario

Pasaje de hoy:
${reading.reference}

${cleanText}

— Compartido desde Su voz a diario`;

            if (navigator.share) {
                navigator.share({
                    title: 'Su voz a diario',
                    text: shareText
                }).catch(() => {});
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(shareText).then(() => {
                    alert('Lectura copiada para compartir');
                }).catch(() => {
                    alert('No se pudo compartir ni copiar la lectura');
                });
            } else {
                alert('Tu dispositivo no permite compartir esta lectura');
            }
            return;
        }

        // Quitar resaltados
        if (e.target.closest('[data-action="clear-highlights"]')) {
            const date = e.target.closest('[data-action="clear-highlights"]').getAttribute('data-date');
            localStorage.removeItem(this.getHighlightsKey(date));
            this.removeHighlightButton();
            this.renderReading(date);
            return;
        }

        // Abrir / cerrar nota
if (e.target.closest('[data-action="toggle-note"]')) {
    const date = e.target.closest('[data-action="toggle-note"]').getAttribute('data-date');
    this.toggleNote(date);
    this.renderReading(date);
    return;
}

// Borrar nota
if (e.target.closest('[data-action="delete-note"]')) {
    const date = e.target.closest('[data-action="delete-note"]').getAttribute('data-date');
    this.deleteNote(date);
    this.renderReading(date);
    return;
}
        // Navegación
        if (e.target.closest('[data-nav]')) {
            const targetView = e.target.closest('[data-nav]').getAttribute('data-nav');
            const param = e.target.closest('[data-nav]').getAttribute('data-param');
            if (targetView === 'calendar') {
                this.navigate('calendar');
            } else if (targetView === 'reading' && param) {
                this.navigate('reading', param);
            }
        }
    });

      this.$content.addEventListener('input', (e) => {
    if (e.target.matches('.note-textarea')) {
        const date = e.target.getAttribute('data-note-date');
        if (date) {
            this.saveNote(date, e.target.value);
            this.showNoteSavedMessage(date);
        }
    }
});

    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed) {
            this.removeHighlightButton();
            return;
        }

        const anchorNode = selection.anchorNode;
        if (!anchorNode) return;

        const readingTextEl = document.querySelector('.reading-text');
        if (!readingTextEl) return;

        if (!readingTextEl.contains(anchorNode)) {
            this.removeHighlightButton();
            return;
        }

        const dateStr = readingTextEl.getAttribute('data-reading-date');
        if (!dateStr) return;

        this.showHighlightButton(selection, dateStr);
    });

   document.addEventListener('click', (e) => {
    if (!e.target.closest('#highlight-btn') && !e.target.closest('.reading-text')) {
        this.removeHighlightButton();
    }
});
},

    loadData: async function () {
        try {
            const response = await fetch('data/readings.json');
            this.data = await response.json();
            // Sort by date descending
            this.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (error) {
            console.error('Error loading data:', error);
            this.$content.innerHTML = `<div class="empty-state">No se pudieron cargar las lecturas. Por favor, revisa tu conexión.</div>`;
        }
    },

    navigate: function (view, param = null) {
        let path = `#${view}`;
        if (param) path += `/${param}`;
        history.pushState(null, '', path);
        this.handleRoute();
    },

    handleRoute: function () {
        const hash = window.location.hash.substring(1) || 'home';
        const parts = hash.split('/');
        const view = parts[0];
        const param = parts[1] || null;

        this.resetReadingMode();

        this.currentView = view;
        this.updateNavUI();

        this.$content.classList.remove('fade-in');
        // Trigger reflow
        void this.$content.offsetWidth;
        this.$content.classList.add('fade-in');

        if (view === 'home') {
            this.renderHome();
        } else if (view === 'calendar') {
            this.renderCalendar();
        } else if (view === 'reading' && param) {
            this.renderReading(param);
        } else {
            this.renderHome();
        }
    },

    updateNavUI: function () {
        this.$navHome.classList.toggle('active', this.currentView === 'home' || this.currentView === 'reading');
        this.$navCalendar.classList.toggle('active', this.currentView === 'calendar');
    },

    formatDateEs: function (dateStr) {
        const date = new Date(dateStr + 'T12:00:00'); // Prevent timezone shift issues
        const options = { day: 'numeric', month: 'long' };
        return date.toLocaleDateString('es-ES', options);
    },

    getTodayDateStr: function () {
        const year = this.today.getFullYear();
        const month = String(this.today.getMonth() + 1).padStart(2, '0');
        const day = String(this.today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    renderHome: function () {
        const todayStr = this.getTodayDateStr();
        const reading = this.data.find(r => r.date === todayStr);

        this.renderViewContent(reading, true);
    },

    renderReading: function (dateStr) {
        const reading = this.data.find(r => r.date === dateStr);
        this.renderViewContent(reading, false);
    },

    renderViewContent: function (reading, isHome = false) {
        const todayStr = this.getTodayDateStr();

        if (!reading) {
            this.$content.innerHTML = `
                <div class="empty-state">
                    <h3>No hay lectura programada para este día.</h3>
                    <br>
                    <button class="btn-primary" data-nav="calendar" style="width: auto; margin: auto;">Ver lecturas disponibles</button>
                </div>
            `;
            return;
        }

        const dateFormatted = this.formatDateEs(reading.date);
        let badgeText = isHome ? (reading.date === todayStr ? 'HOY' : 'LECTURA') : dateFormatted;

        this.$content.innerHTML = `
    ${isHome ? `<div style="text-align: center;"><span class="date-badge">${todayStr === reading.date ? 'HOY, ' + dateFormatted.toUpperCase() : dateFormatted.toUpperCase()}</span></div>` : ''}
    
    <div class="reading-card">
    <div class="section-title">Su voz ${isHome ? 'hoy' : 'este día'}</div>
    <h2 class="reading-reference">${reading.reference}</h2>
    <div class="reading-text" data-reading-date="${reading.date}">
        ${this.applyHighlightsToHtml(reading.text, this.getHighlights(reading.date))}
    </div>
</div>

   <div class="main-action">
    ${this.isRead(reading.date)
        ? `<button class="btn-primary" disabled>Leído ✔</button>`
        : `<button class="btn-primary" data-action="mark-read" data-date="${reading.date}">Marcar como leído</button>`
    }
</div>

<div class="action-group">

    <button class="btn-secondary" data-action="share-reading" data-date="${reading.date}">Compartir lectura</button>

   ${this.hasHighlights(reading.date)
        ? `<button class="btn-secondary" data-action="clear-highlights" data-date="${reading.date}">Quitar resaltados</button>`
        : ''
    }

    <button class="btn-secondary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
    ${this.openNoteDate === reading.date ? 'Cerrar nota' : 'Abrir nota'}
    ${this.hasNote(reading.date) ? ' •' : ''}
</button>
</div>

${this.openNoteDate === reading.date ? `
    <div class="note-box">
        <textarea class="note-textarea" data-note-date="${reading.date}" placeholder="Escribe aquí tu nota sobre esta lectura...">${this.getNote(reading.date)}</textarea>

        ${this.noteSavedMessageDate === reading.date ? `
            <div class="note-saved-message">Guardado automáticamente</div>
        ` : ''}

        <div class="note-actions">
            <button class="btn-secondary" data-action="delete-note" data-date="${reading.date}">Borrar nota</button>
        </div>
    </div>
` : ''}

${this.readingMode ? `
    <button class="exit-reading-btn" data-action="exit-reading-mode">Salir</button>
` : ''}
    `;
},
    
    renderCalendar: function () {
    if (this.data.length === 0) {
        this.$content.innerHTML = `<div class="empty-state">No hay lecturas disponibles.</div>`;
        return;
    }

    let html = '<div class="calendar-grid">';

    this.data.forEach(item => {
        const dateStr = this.formatDateEs(item.date);
        const readClass = this.isRead(item.date) ? 'read' : '';

        const todayStr = this.getTodayDateStr();
        const isToday = item.date === todayStr;
        const todayClass = isToday ? 'today' : '';

            html += `
                <div class="calendar-day ${readClass} ${todayClass}" data-nav="reading" data-param="${item.date}">
        
                    ${isToday ? '<div class="today-badge">HOY</div>' : ''}

                <div class="cal-date">${dateStr}</div>
                <div class="cal-ref">
                    ${item.reference}
                    ${this.isRead(item.date) ? '<span class="read-badge">Leído ✔</span>' : ''}
                    ${this.hasNote(item.date) ? '<span class="note-badge">Nota</span>' : ''}
                </div>
                <div class="cal-arrow">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                    </svg>
                </div>
            </div>
        `;
    });

    html += '</div>';
    this.$content.innerHTML = html;
}
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
