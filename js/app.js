const App = {
    data: [],
    currentView: 'home',
    today: new Date(),

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
    // ----------------------------------

    init: async function () {
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
        this.handleRoute();
    },

    cacheDOM: function () {
        this.$content = document.getElementById('app-content');
        this.$navHome = document.getElementById('nav-home');
        this.$navCalendar = document.getElementById('nav-calendar');
    },

    bindEvents: function () {
    this.$navHome.addEventListener('click', () => this.navigate('home'));
    this.$navCalendar.addEventListener('click', () => this.navigate('calendar'));
    window.addEventListener('popstate', () => this.handleRoute());

    this.$content.addEventListener('click', (e) => {
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
        <div class="reading-text">
            ${reading.text}
        </div>
    </div>

    ${this.isRead(reading.date)
                ? `<button class="btn-secondary" disabled>Leído ✔</button>`
                : `<button class="btn-secondary" data-action="mark-read" data-date="${reading.date}">Marcar como leído</button>`
            }

<button class="btn-secondary" data-action="share-reading" data-date="${reading.date}">Compartir lectura</button>

${isHome
                ? `<button class="btn-primary" data-nav="calendar">Ver calendario</button>`
                : `<button class="btn-primary" data-nav="calendar">Volver al calendario</button>`
            }
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
