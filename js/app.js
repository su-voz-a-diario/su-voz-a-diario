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

        // Listen to clicks within the container (event delegation)
        this.$content.addEventListener('click', (e) => {
            // Marcar como leído
            if (e.target.closest('[data-action="mark-read"]')) {
                const date = e.target.closest('[data-action="mark-read"]').getAttribute('data-date');
                this.markAsRead(date);
                this.renderReading(date);
                return;
            }
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
            this.data.sort((a, b) => new Date(b.date) - new Date(a.date));
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

    ${isHome
                ? `<button class="btn-primary" data-nav="calendar">Ver calendario</button>`
                : `<button class="btn-primary" data-nav="calendar">Volver al calendario</button>`
            }
`;
    },
    renderCalendar: function() {
    if (this.data.length === 0) {
        this.$content.innerHTML = `<div class="empty-state">No hay lecturas disponibles.</div>`;
        return;
    }

    const todayStr = this.getTodayDateStr();

    const readingsByDate = {};
    this.data.forEach(item => {
        readingsByDate[item.date] = item;
    });

    const dates = this.data.map(item => new Date(item.date + 'T12:00:00'));
    const firstDate = new Date(Math.min(...dates));
    const year = firstDate.getFullYear();
    const month = firstDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startWeekDay = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthName = firstDayOfMonth.toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric'
    });

    let html = `
        <div class="calendar-header-title">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>
        <div class="calendar-grid">
            <div class="calendar-weekday">Dom</div>
            <div class="calendar-weekday">Lun</div>
            <div class="calendar-weekday">Mar</div>
            <div class="calendar-weekday">Mié</div>
            <div class="calendar-weekday">Jue</div>
            <div class="calendar-weekday">Vie</div>
            <div class="calendar-weekday">Sáb</div>
    `;

    for (let i = 0; i < startWeekDay; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        const reading = readingsByDate[dateStr];
        const isToday = dateStr === todayStr;
        const isRead = reading ? this.isRead(dateStr) : false;

        let dayClasses = 'calendar-day';
        if (reading) dayClasses += ' has-reading';
        if (isToday) dayClasses += ' today';
        if (isRead) dayClasses += ' read';

        html += `
            <div class="${dayClasses}" ${reading ? `data-nav="reading" data-param="${dateStr}"` : ''}>
                <div class="day-number">${day}</div>
                ${reading ? `<div class="day-ref">${reading.reference}</div>` : ''}
                ${isRead ? `<div class="day-read-check">✔</div>` : ''}
            </div>
        `;
    }

    html += `</div>`;
    this.$content.innerHTML = html;
}
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
