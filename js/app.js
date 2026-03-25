/**
 * Su Voz a Diario - App de Meditación Bíblica
 * Versión mejorada con rachas, estadísticas, notificaciones y más
 */

const App = {
    // ========================================
    // DATOS Y ESTADO
    // ========================================
    data: [],
    currentView: 'home',
    today: new Date(),
    currentVersion: 'rvr60',
    openNoteDate: null,
    noteSavedMessageDate: null,
    readingMode: false,
    
    // Sistema de rachas
    streak: {
        current: 0,
        longest: 0,
        lastReadDate: null
    },
    
    // Configuración
    settings: {
        reminderTime: '08:00',
        notificationsEnabled: true
    },
    
    // Timeout para mensajes
    noteSavedTimeout: null,
    
    // ========================================
    // INICIALIZACIÓN
    // ========================================
    init: async function() {
        this.cacheDOM();
        this.loadSettings();
        this.loadStreak();
        this.initTheme();
        this.initNotifications();
        this.bindEvents();
        await this.loadData();
        this.handleRoute();
        this.updateStreakUI();
    },
    
    cacheDOM: function() {
        this.$content = document.getElementById('app-content');
        this.$navHome = document.getElementById('nav-home');
        this.$navCalendar = document.getElementById('nav-calendar');
        this.$navStats = document.getElementById('nav-stats');
        this.$navSettings = document.getElementById('nav-settings');
        this.$streakIndicator = document.getElementById('streak-indicator');
        this.$streakCount = document.getElementById('streak-count');
    },
    
    // ========================================
    // SISTEMA DE RACHAS
    // ========================================
    loadStreak: function() {
        const saved = localStorage.getItem('su-voz-streak');
        if (saved) {
            this.streak = JSON.parse(saved);
        }
    },
    
    saveStreak: function() {
        localStorage.setItem('su-voz-streak', JSON.stringify(this.streak));
        this.updateStreakUI();
    },
    
    updateStreak: function(dateStr) {
        const yesterday = this.getYesterdayDateStr();
        const today = dateStr;
        
        if (this.streak.lastReadDate === yesterday) {
            this.streak.current++;
            if (this.streak.current > this.streak.longest) {
                this.streak.longest = this.streak.current;
            }
        } else if (this.streak.lastReadDate !== today && this.streak.lastReadDate !== yesterday) {
            this.streak.current = 1;
        }
        
        this.streak.lastReadDate = today;
        this.saveStreak();
    },
    
    getYesterdayDateStr: function() {
        const yesterday = new Date(this.today);
        yesterday.setDate(yesterday.getDate() - 1);
        const year = yesterday.getFullYear();
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    updateStreakUI: function() {
        if (this.$streakIndicator && this.$streakCount) {
            if (this.streak.current > 0) {
                this.$streakIndicator.style.display = 'flex';
                this.$streakCount.textContent = this.streak.current;
            } else {
                this.$streakIndicator.style.display = 'none';
            }
        }
    },
    
    // ========================================
    // CONFIGURACIÓN
    // ========================================
    loadSettings: function() {
        const saved = localStorage.getItem('su-voz-settings');
        if (saved) {
            this.settings = JSON.parse(saved);
        }
    },
    
    saveSettings: function() {
        localStorage.setItem('su-voz-settings', JSON.stringify(this.settings));
    },
    
    // ========================================
    // NOTIFICACIONES
    // ========================================
    initNotifications: function() {
        if (!('Notification' in window)) return;
        
        if (this.settings.notificationsEnabled && Notification.permission === 'default') {
            setTimeout(() => {
                if (Notification.permission === 'default') {
                    Notification.requestPermission();
                }
            }, 5000);
        }
        
        this.scheduleNotification();
    },
    
    scheduleNotification: function() {
        if (!this.settings.notificationsEnabled) return;
        
        const [hour, minute] = this.settings.reminderTime.split(':');
        const now = new Date();
        const scheduled = new Date();
        scheduled.setHours(parseInt(hour), parseInt(minute), 0);
        
        let delay = scheduled - now;
        if (delay < 0) {
            delay += 24 * 60 * 60 * 1000;
        }
        
        setTimeout(() => {
            this.showDailyReminder();
            this.scheduleNotification();
        }, delay);
    },
    
    showDailyReminder: function() {
        const todayStr = this.getTodayDateStr();
        if (!this.isRead(todayStr) && this.settings.notificationsEnabled) {
            if (Notification.permission === 'granted') {
                new Notification('📖 Su Voz a Diario', {
                    body: '¿Ya meditaste la lectura de hoy? Tómate un momento con Dios.',
                    icon: '/icons/icon-192.png',
                    vibrate: [200, 100, 200]
                });
            }
        }
    },
    
    // ========================================
    // ESTADÍSTICAS
    // ========================================
    getStats: function() {
        const readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        const totalRead = readDates.length;
        const totalAvailable = this.data.length;
        
        // Calcular días consecutivos actuales
        let currentStreak = 0;
        let checkDate = new Date(this.today);
        
        while (true) {
            const dateStr = this.formatDateForCompare(checkDate);
            if (readDates.includes(dateStr)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        // Calcular porcentaje
        const percentage = totalAvailable > 0 ? Math.round((totalRead / totalAvailable) * 100) : 0;
        
        // Notas totales
        let totalNotes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('su-voz-note-')) {
                const note = JSON.parse(localStorage.getItem(key));
                if (note.dios || note.aprendizaje || note.respuesta) {
                    totalNotes++;
                }
            }
        }
        
        return {
            totalRead,
            totalAvailable,
            percentage,
            currentStreak,
            longestStreak: this.streak.longest,
            totalNotes
        };
    },
    
    // ========================================
    // FUNCIONES EXISTENTES (MANTENIDAS Y MEJORADAS)
    // ========================================
    markAsRead: function(dateStr) {
        let readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        if (!readDates.includes(dateStr)) {
            readDates.push(dateStr);
            localStorage.setItem('su-voz-read-dates', JSON.stringify(readDates));
            this.updateStreak(dateStr);
            
            // Feedback háptico si está disponible
            if ('vibrate' in navigator) {
                navigator.vibrate(50);
            }
        }
    },
    
    isRead: function(dateStr) {
        let readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        return readDates.includes(dateStr);
    },
    
    getHighlightsKey: function(dateStr) {
        return `su-voz-highlights-${dateStr}`;
    },
    
    getHighlights: function(dateStr) {
        return JSON.parse(localStorage.getItem(this.getHighlightsKey(dateStr))) || [];
    },
    
    hasHighlights: function(dateStr) {
        return this.getHighlights(dateStr).length > 0;
    },
    
    saveHighlights: function(dateStr, highlights) {
        localStorage.setItem(this.getHighlightsKey(dateStr), JSON.stringify(highlights));
    },
    
    getNoteKey: function(dateStr) {
        return `su-voz-note-${dateStr}`;
    },
    
    getNote: function(dateStr) {
        return JSON.parse(localStorage.getItem(this.getNoteKey(dateStr))) || {
            dios: '',
            aprendizaje: '',
            respuesta: ''
        };
    },
    
    hasNote: function(dateStr) {
        const note = this.getNote(dateStr);
        return note.dios.trim().length > 0 ||
               note.aprendizaje.trim().length > 0 ||
               note.respuesta.trim().length > 0;
    },
    
    saveNote: function(dateStr, noteObj) {
        localStorage.setItem(this.getNoteKey(dateStr), JSON.stringify(noteObj));
    },
    
    deleteNote: function(dateStr) {
        localStorage.removeItem(this.getNoteKey(dateStr));
    },
    
    toggleNote: function(dateStr) {
        this.openNoteDate = this.openNoteDate === dateStr ? null : dateStr;
    },
    
    changeFontSize: function(delta) {
        let current = parseFloat(localStorage.getItem('reading-size')) || 1.08;
        current += delta;
        if (current < 0.9) current = 0.9;
        if (current > 1.6) current = 1.6;
        localStorage.setItem('reading-size', current);
        document.documentElement.style.setProperty('--reading-size', current + 'rem');
        
        // Re-renderizar si es necesario
        if (this.currentView === 'reading' || this.currentView === 'home') {
            this.handleRoute();
        }
    },
    
    exportReflectionPDF: function(dateStr) {
        const reading = this.data.find(r => r.date === dateStr);
        if (!reading) return;
        
        const note = this.getNote(dateStr);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const marginLeft = 20;
        let y = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const usableWidth = pageWidth - marginLeft * 2;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Su voz a diario', marginLeft, y);
        
        y += 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Fecha: ${this.formatDateEs(dateStr)}`, marginLeft, y);
        
        y += 8;
        doc.setFont('helvetica', 'bold');
        doc.text(`Pasaje: ${reading.reference}`, marginLeft, y);
        
        y += 14;
        doc.setFontSize(14);
        doc.text('Mi reflexión', marginLeft, y);
        
        y += 10;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Lo que veo de Dios', marginLeft, y);
        
        y += 6;
        doc.setFont('helvetica', 'normal');
        const diosLines = doc.splitTextToSize(note.dios || 'Sin contenido.', usableWidth);
        doc.text(diosLines, marginLeft, y);
        y += diosLines.length * 6 + 8;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Lo que aprendo del pasaje', marginLeft, y);
        
        y += 6;
        doc.setFont('helvetica', 'normal');
        const aprendizajeLines = doc.splitTextToSize(note.aprendizaje || 'Sin contenido.', usableWidth);
        doc.text(aprendizajeLines, marginLeft, y);
        y += aprendizajeLines.length * 6 + 8;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Mi respuesta hoy', marginLeft, y);
        
        y += 6;
        doc.setFont('helvetica', 'normal');
        const respuestaLines = doc.splitTextToSize(note.respuesta || 'Sin contenido.', usableWidth);
        doc.text(respuestaLines, marginLeft, y);
        
        doc.save(`reflexion-${dateStr}.pdf`);
    },
    
    resetReadingMode: function() {
        this.readingMode = false;
        document.body.classList.remove('reading-mode');
    },
    
    showNoteSavedMessage: function(dateStr) {
        this.noteSavedMessageDate = dateStr;
        clearTimeout(this.noteSavedTimeout);
        this.noteSavedTimeout = setTimeout(() => {
            this.noteSavedMessageDate = null;
            if (this.currentView === 'reading' || this.currentView === 'home') {
                this.handleRoute();
            }
        }, 1200);
    },
    
    escapeRegExp: function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    
    applyHighlightsToHtml: function(html, highlights) {
        let result = html;
        highlights.forEach(text => {
            if (!text || !text.trim()) return;
            const escaped = this.escapeRegExp(text.trim());
            const regex = new RegExp(`(${escaped})(?![^<]*>|[^<>]*<\\/mark>)`, 'gi');
            result = result.replace(regex, '<mark class="user-highlight">$1</mark>');
        });
        return result;
    },
    
    removeHighlightButton: function() {
        const existing = document.getElementById('highlight-btn');
        if (existing) existing.remove();
    },
    
    showHighlightButton: function(selection, dateStr) {
        this.removeHighlightButton();
        const selectedText = selection.toString().trim();
        if (!selectedText) return;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const btn = document.createElement('button');
        btn.id = 'highlight-btn';
        btn.className = 'highlight-btn';
        btn.textContent = '✨ Resaltar';
        
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
            this.handleRoute();
        });
        
        document.body.appendChild(btn);
    },
    
    // ========================================
    // NAVEGACIÓN Y RENDERIZADO
    // ========================================
    loadData: async function() {
        try {
            const response = await fetch('data/readings.json');
            this.data = await response.json();
            this.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (error) {
            console.error('Error loading data:', error);
            this.$content.innerHTML = `<div class="empty-state">No se pudieron cargar las lecturas. Por favor, revisa tu conexión.</div>`;
        }
    },
    
    navigate: function(view, param = null) {
        let path = `#${view}`;
        if (param) path += `/${param}`;
        history.pushState(null, '', path);
        this.handleRoute();
    },
    
    handleRoute: function() {
        const hash = window.location.hash.substring(1) || 'home';
        const parts = hash.split('/');
        const view = parts[0];
        const param = parts[1] || null;
        
        this.resetReadingMode();
        this.currentView = view;
        this.updateNavUI();
        
        // Actualizar botones de versión
        document.querySelectorAll('.version-btn').forEach(btn => {
            btn.classList.toggle(
                'active',
                btn.getAttribute('data-version') === this.currentVersion
            );
        });
        
        // Animación fade
        this.$content.classList.remove('fade-in');
        void this.$content.offsetWidth;
        this.$content.classList.add('fade-in');
        
        // Renderizar vista
        if (view === 'home') {
            this.renderHome();
        } else if (view === 'calendar') {
            this.renderCalendar();
        } else if (view === 'stats') {
            this.renderStats();
        } else if (view === 'settings') {
            this.renderSettings();
        } else if (view === 'reading' && param) {
            this.renderReading(param);
        } else {
            this.renderHome();
        }
    },
    
    updateNavUI: function() {
        const navBtns = [
            { btn: this.$navHome, views: ['home', 'reading'] },
            { btn: this.$navCalendar, views: ['calendar'] },
            { btn: this.$navStats, views: ['stats'] },
            { btn: this.$navSettings, views: ['settings'] }
        ];
        
        navBtns.forEach(({ btn, views }) => {
            if (btn) {
                if (views.includes(this.currentView)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
    },
    
    formatDateEs: function(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        const options = { day: 'numeric', month: 'long' };
        return date.toLocaleDateString('es-ES', options);
    },
    
    formatDateForCompare: function(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    getTodayDateStr: function() {
        const year = this.today.getFullYear();
        const month = String(this.today.getMonth() + 1).padStart(2, '0');
        const day = String(this.today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    renderHome: function() {
        const todayStr = this.getTodayDateStr();
        const reading = this.data.find(r => r.date === todayStr);
        this.renderViewContent(reading, true);
    },
    
    renderReading: function(dateStr) {
        const reading = this.data.find(r => r.date === dateStr);
        this.renderViewContent(reading, false);
    },
    
    renderViewContent: function(reading, isHome = false) {
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
        const badgeText = isHome ? (reading.date === todayStr ? 'HOY' : 'LECTURA') : dateFormatted;
        const readingText = reading.versions?.[this.currentVersion] || reading.text || '';
        
        this.$content.innerHTML = `
            ${!isHome ? `<div class="reading-date-header">${dateFormatted.toUpperCase()}</div>` : ''}
            
            <div class="reading-card">
                <div class="section-title">Su voz ${isHome ? 'hoy' : 'este día'}</div>
                <h2 class="reading-reference">${reading.reference}</h2>
                <div class="reading-text" data-reading-date="${reading.date}">
                    ${this.applyHighlightsToHtml(readingText, this.getHighlights(reading.date))}
                </div>
            </div>
            
            <div class="main-action">
                <button class="btn-secondary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
                    ${this.openNoteDate === reading.date ? 'Cerrar reflexión' : '📝 Mi reflexión'}
                    ${this.hasNote(reading.date) ? ' ✓' : ''}
                </button>
            </div>
            
            ${this.openNoteDate === reading.date ? `
                <div class="note-box">
                    <div class="note-section">
                        <div class="note-title">👑 Lo que veo de Dios</div>
                        <textarea class="note-textarea" data-field="dios" data-note-date="${reading.date}" placeholder="¿Qué revela este texto acerca de Dios?">${this.escapeHtml(this.getNote(reading.date).dios)}</textarea>
                    </div>
                    <div class="note-section">
                        <div class="note-title">📖 Lo que aprendo del pasaje</div>
                        <textarea class="note-textarea" data-field="aprendizaje" data-note-date="${reading.date}" placeholder="¿Qué ejemplo, advertencia o enseñanza encuentro aquí?">${this.escapeHtml(this.getNote(reading.date).aprendizaje)}</textarea>
                    </div>
                    <div class="note-section">
                        <div class="note-title">🙏 Mi respuesta hoy</div>
                        <textarea class="note-textarea" data-field="respuesta" data-note-date="${reading.date}" placeholder="¿Qué debo hacer, cambiar o recordar hoy?">${this.escapeHtml(this.getNote(reading.date).respuesta)}</textarea>
                    </div>
                    ${this.noteSavedMessageDate === reading.date ? `
                        <div class="note-saved-message">✓ Guardado automáticamente</div>
                    ` : ''}
                    <div class="note-actions">
                        <button class="btn-secondary" data-action="export-pdf" data-date="${reading.date}">📄 Exportar PDF</button>
                        <button class="btn-secondary" data-action="delete-note" data-date="${reading.date}">🗑️ Borrar reflexión</button>
                    </div>
                </div>
            ` : ''}
            
            <div class="main-action">
                ${this.isRead(reading.date)
                    ? `<button class="btn-primary" disabled>✓ Leído hoy</button>`
                    : `<button class="btn-primary" data-action="mark-read" data-date="${reading.date}">✓ Marcar como leído</button>`
                }
            </div>
            
            <div class="action-group">
                <button class="btn-secondary" data-action="share-reading" data-date="${reading.date}">📤 Compartir lectura</button>
                ${this.hasHighlights(reading.date)
                    ? `<button class="btn-secondary" data-action="clear-highlights" data-date="${reading.date}">✨ Quitar resaltados</button>`
                    : ''
                }
            </div>
            
            ${this.readingMode ? `
                <button class="exit-reading-btn" data-action="exit-reading-mode">✕ Salir del modo lectura</button>
            ` : ''}
        `;
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    renderCalendar: function() {
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
                        ${this.isRead(item.date) ? '<span class="read-badge">✓</span>' : ''}
                        ${this.hasNote(item.date) ? '<span class="note-badge">📝</span>' : ''}
                    </div>
                    <div class="cal-arrow">→</div>
                </div>
            `;
        });
        
        html += '</div>';
        this.$content.innerHTML = html;
    },
    
    renderStats: function() {
        const stats = this.getStats();
        
        this.$content.innerHTML = `
            <div class="stats-container">
                <div class="stat-card">
                    <div class="stat-number">${stats.totalRead}</div>
                    <div class="stat-label">Lecturas completadas</div>
                    <div class="stat-progress">
                        <div class="progress-bar" style="width: ${stats.percentage}%"></div>
                        <div class="progress-text">${stats.percentage}% del plan</div>
                    </div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">🔥 ${stats.currentStreak}</div>
                    <div class="stat-label">Días consecutivos</div>
                    <div class="stat-note">Récord: ${stats.longestStreak} días</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">📝 ${stats.totalNotes}</div>
                    <div class="stat-label">Reflexiones escritas</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">📖 ${stats.totalAvailable}</div>
                    <div class="stat-label">Lecturas disponibles</div>
                </div>
            </div>
        `;
    },
    
    renderSettings: function() {
        this.$content.innerHTML = `
            <div class="settings-container">
                <div class="setting-card">
                    <h3>🔔 Notificaciones</h3>
                    <div class="setting-item">
                        <label>Recordatorio diario</label>
                        <div class="setting-control">
                            <input type="time" id="reminder-time" value="${this.settings.reminderTime}" class="time-input">
                            <button id="test-notification" class="btn-secondary">Probar</button>
                        </div>
                    </div>
                    <div class="setting-item">
                        <label>Activar notificaciones</label>
                        <label class="switch">
                            <input type="checkbox" id="notifications-toggle" ${this.settings.notificationsEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-card">
                    <h3>💾 Datos</h3>
                    <div class="setting-item">
                        <button id="export-data" class="btn-secondary">Exportar mis datos</button>
                        <button id="import-data" class="btn-secondary">Importar respaldo</button>
                    </div>
                    <div class="setting-item">
                        <button id="reset-data" class="btn-secondary danger">Reiniciar todo</button>
                    </div>
                    <input type="file" id="import-file" accept=".json" style="display: none;">
                </div>
                
                <div class="setting-card">
                    <h3>ℹ️ Acerca de</h3>
                    <p>Su Voz a Diario v2.0</p>
                    <p>Meditación bíblica diaria con reflexiones personales</p>
                </div>
            </div>
        `;
        
        // Bindear eventos de configuración
        const reminderTime = document.getElementById('reminder-time');
        const notificationsToggle = document.getElementById('notifications-toggle');
        const testNotification = document.getElementById('test-notification');
        const exportBtn = document.getElementById('export-data');
        const importBtn = document.getElementById('import-data');
        const resetBtn = document.getElementById('reset-data');
        const importFile = document.getElementById('import-file');
        
        if (reminderTime) {
            reminderTime.addEventListener('change', (e) => {
                this.settings.reminderTime = e.target.value;
                this.saveSettings();
                this.scheduleNotification();
            });
        }
        
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', (e) => {
                this.settings.notificationsEnabled = e.target.checked;
                this.saveSettings();
                if (this.settings.notificationsEnabled && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                }
                this.scheduleNotification();
            });
        }
        
        if (testNotification) {
            testNotification.addEventListener('click', () => {
                if (Notification.permission === 'granted') {
                    new Notification('Su Voz a Diario', {
                        body: '¡Las notificaciones funcionan correctamente!',
                        icon: '/icons/icon-192.png'
                    });
                } else {
                    Notification.requestPermission();
                }
            });
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportAllData());
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', () => importFile.click());
        }
        
        if (importFile) {
            importFile.addEventListener('change', (e) => this.importData(e.target.files[0]));
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('¿Estás seguro? Se borrarán todos tus datos (lecturas, notas, rachas).')) {
                    this.resetAllData();
                }
            });
        }
    },
    
    exportAllData: function() {
        const allData = {
            readDates: JSON.parse(localStorage.getItem('su-voz-read-dates')) || [],
            streak: this.streak,
            settings: this.settings,
            notes: {},
            highlights: {}
        };
        
        // Recopilar notas
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('su-voz-note-')) {
                const date = key.replace('su-voz-note-', '');
                allData.notes[date] = JSON.parse(localStorage.getItem(key));
            }
            if (key && key.startsWith('su-voz-highlights-')) {
                const date = key.replace('su-voz-highlights-', '');
                allData.highlights[date] = JSON.parse(localStorage.getItem(key));
            }
        }
        
        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `su-voz-backup-${this.getTodayDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    importData: function(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.readDates) {
                    localStorage.setItem('su-voz-read-dates', JSON.stringify(data.readDates));
                }
                if (data.streak) {
                    this.streak = data.streak;
                    this.saveStreak();
                }
                if (data.settings) {
                    this.settings = data.settings;
                    this.saveSettings();
                }
                if (data.notes) {
                    Object.entries(data.notes).forEach(([date, note]) => {
                        localStorage.setItem(`su-voz-note-${date}`, JSON.stringify(note));
                    });
                }
                if (data.highlights) {
                    Object.entries(data.highlights).forEach(([date, highlights]) => {
                        localStorage.setItem(`su-voz-highlights-${date}`, JSON.stringify(highlights));
                    });
                }
                
                alert('Datos importados correctamente. La página se recargará.');
                location.reload();
            } catch (error) {
                alert('Error al importar: archivo inválido');
            }
        };
        reader.readAsText(file);
    },
    
    resetAllData: function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('su-voz-')) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
        
        this.streak = { current: 0, longest: 0, lastReadDate: null };
        this.saveStreak();
        
        alert('Todos los datos han sido reiniciados.');
        location.reload();
    },
    
    // ========================================
    // EVENTOS
    // ========================================
    bindEvents: function() {
        // Navegación
        if (this.$navHome) this.$navHome.addEventListener('click', () => this.navigate('home'));
        if (this.$navCalendar) this.$navCalendar.addEventListener('click', () => this.navigate('calendar'));
        if (this.$navStats) this.$navStats.addEventListener('click', () => this.navigate('stats'));
        if (this.$navSettings) this.$navSettings.addEventListener('click', () => this.navigate('settings'));
        window.addEventListener('popstate', () => this.handleRoute());
        
        // Controles de fuente
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="font-increase"]')) {
                this.changeFontSize(0.05);
            }
            if (e.target.closest('[data-action="font-decrease"]')) {
                this.changeFontSize(-0.05);
            }
            
            // Cambio de versión
            const versionBtn = e.target.closest('[data-version]');
            if (versionBtn) {
                this.currentVersion = versionBtn.getAttribute('data-version');
                localStorage.setItem('current-version', this.currentVersion);
                document.querySelectorAll('.version-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-version') === this.currentVersion);
                });
                this.handleRoute();
            }
        });
        
        // Eventos del contenido
        this.$content.addEventListener('click', (e) => {
            // Modo lectura
            if (e.target.closest('.reading-text')) {
                const readingEl = e.target.closest('.reading-text');
                const date = readingEl.getAttribute('data-reading-date');
                this.readingMode = !this.readingMode;
                document.body.classList.toggle('reading-mode', this.readingMode);
                if (date) this.renderReading(date);
                return;
            }
            
            if (e.target.closest('[data-action="exit-reading-mode"]')) {
                const readingEl = document.querySelector('.reading-text');
                const date = readingEl ? readingEl.getAttribute('data-reading-date') : null;
                this.readingMode = false;
                document.body.classList.remove('reading-mode');
                if (date) this.renderReading(date);
                return;
            }
            
            // Marcar como leído
            const markBtn = e.target.closest('[data-action="mark-read"]');
            if (markBtn) {
                const date = markBtn.getAttribute('data-date');
                this.markAsRead(date);
                this.renderReading(date);
                return;
            }
            
            // Compartir
            const shareBtn = e.target.closest('[data-action="share-reading"]');
            if (shareBtn) {
                const date = shareBtn.getAttribute('data-date');
                const reading = this.data.find(r => r.date === date);
                if (reading) {
                    const cleanText = (reading.versions?.[this.currentVersion] || reading.text || '').replace(/<[^>]+>/g, '');
                    const shareText = `Su voz a diario\n\nPasaje de hoy:\n${reading.reference}\n\n${cleanText.substring(0, 500)}...\n\n— Compartido desde Su voz a diario`;
                    if (navigator.share) {
                        navigator.share({ title: 'Su voz a diario', text: shareText });
                    } else if (navigator.clipboard) {
                        navigator.clipboard.writeText(shareText).then(() => alert('Lectura copiada'));
                    }
                }
                return;
            }
            
            // Exportar PDF
            const pdfBtn = e.target.closest('[data-action="export-pdf"]');
            if (pdfBtn) {
                const date = pdfBtn.getAttribute('data-date');
                this.exportReflectionPDF(date);
                return;
            }
            
            // Quitar resaltados
            const clearBtn = e.target.closest('[data-action="clear-highlights"]');
            if (clearBtn) {
                const date = clearBtn.getAttribute('data-date');
                localStorage.removeItem(this.getHighlightsKey(date));
                this.removeHighlightButton();
                this.renderReading(date);
                return;
            }
            
            // Notas
            const noteBtn = e.target.closest('[data-action="toggle-note"]');
            if (noteBtn) {
                const date = noteBtn.getAttribute('data-date');
                this.toggleNote(date);
                this.renderReading(date);
                return;
            }
            
            const deleteNoteBtn = e.target.closest('[data-action="delete-note"]');
            if (deleteNoteBtn) {
                const date = deleteNoteBtn.getAttribute('data-date');
                this.deleteNote(date);
                this.renderReading(date);
                return;
            }
            
            // Navegación desde calendario
            const navItem = e.target.closest('[data-nav]');
            if (navItem) {
                const targetView = navItem.getAttribute('data-nav');
                const param = navItem.getAttribute('data-param');
                if (targetView === 'reading' && param) {
                    this.navigate('reading', param);
                }
            }
        });
        
        // Auto-guardado de notas
        this.$content.addEventListener('input', (e) => {
            if (e.target.matches('.note-textarea')) {
                const date = e.target.getAttribute('data-note-date');
                const field = e.target.getAttribute('data-field');
                if (date && field) {
                    const note = this.getNote(date);
                    note[field] = e.target.value;
                    this.saveNote(date, note);
                    this.showNoteSavedMessage(date);
                }
            }
        });
        
        // Resaltado de texto
        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                this.removeHighlightButton();
                return;
            }
            const anchorNode = selection.anchorNode;
            if (!anchorNode) return;
            const readingTextEl = document.querySelector('.reading-text');
            if (!readingTextEl || !readingTextEl.contains(anchorNode)) {
                this.removeHighlightButton();
                return;
            }
            const dateStr = readingTextEl.getAttribute('data-reading-date');
            if (dateStr) this.showHighlightButton(selection, dateStr);
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#highlight-btn') && !e.target.closest('.reading-text')) {
                this.removeHighlightButton();
            }
        });
    },
    
    initTheme: function() {
        const savedTheme = localStorage.getItem('theme');
        const toggleBtn = document.getElementById('theme-toggle');
        
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            if (toggleBtn) toggleBtn.textContent = '☀️';
        } else if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            if (toggleBtn) toggleBtn.textContent = '🌙';
        } else {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (systemDark) document.body.classList.add('dark-mode');
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
    }
};

// Inicializar la app
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
