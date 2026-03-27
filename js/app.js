/**
 * Su Voz a Diario - App de estudio de la palabra de Dios.
 * Versión 2.1 con integración completa con Service Worker
 * Funcionalidades: Rachas, Estadísticas, Notificaciones, PWA, Backup
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
        notificationsEnabled: true,
        autoSaveNotes: true,
        fontSize: 1.08
    },
    
    // Timeout para mensajes
    noteSavedTimeout: null,
    renderScheduled: false,
    controlsCollapsed: false,
    lastReadingTap: 0,
    readingTapDelay: 400,
    
    // ========================================
    // INICIALIZACIÓN
    // ========================================
   init: async function() {
    console.log('[App] Inicializando...');
    
    this.cacheDOM();
    this.loadSettings();
    this.loadStreak();
    this.loadFontSize();
    this.loadControlsState();

    const savedVersion = localStorage.getItem('current-version');
    if (savedVersion) {
    this.currentVersion = savedVersion;
    }
       
    this.initTheme();
    this.initNotifications();
    this.setupSWCommunication();
    this.bindEvents();
    this.bindFloatingToggle();
    await this.loadData();
    this.checkReminderOnOpen();
    this.handleRoute();
    this.updateStreakUI();
    
    console.log('[App] Inicialización completada');
},
    
cacheDOM: function() {
    this.$content = document.getElementById('app-content');
    this.$navHome = document.getElementById('nav-home');
    this.$navCalendar = document.getElementById('nav-calendar');
    this.$navStats = document.getElementById('nav-stats');
    this.$navSettings = document.getElementById('nav-settings');
    this.$streakIndicator = document.getElementById('streak-indicator');
    this.$streakCount = document.getElementById('streak-count');
    this.$floatingControls = document.getElementById('floating-controls');
    this.$floatingToggle = document.getElementById('floating-toggle');
},
    
    // ========================================
    // COMUNICACIÓN CON SERVICE WORKER
    // ========================================
    setupSWCommunication: function() {
        if (!('serviceWorker' in navigator)) return;
        
        // Escuchar mensajes del Service Worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            const { data } = event;
            
            switch (data.type) {
                case 'CHECK_READ_STATUS':
                    // El SW pregunta si ya se leyó hoy
                    const todayStr = this.getTodayDateStr();
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ 
                            isReadToday: this.isRead(todayStr) 
                        });
                    }
                    break;
                    
                case 'NAVIGATE_TO':
                    // Navegar a una ruta específica desde notificación
                    if (data.url) {
                        const path = data.url.replace('./', '').replace('#', '');
                        this.navigate(path || 'home');
                    }
                    break;
                    
                case 'SYNC_COMPLETE':
                    console.log('[App] Sincronización completada');
                    this.showToast('Datos sincronizados correctamente');
                    break;
                    
                default:
                    console.log('[App] Mensaje del SW:', data);
            }
        });
        
        // Notificar al SW que la app está lista
        this.sendToSW({ type: 'APP_READY' });
    },
    
    sendToSW: function(message) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
        }
    },
    
    // ========================================
    // SISTEMA DE RACHAS (MEJORADO)
    // ========================================
    loadStreak: function() {
        const saved = localStorage.getItem('su-voz-streak');
        if (saved) {
            try {
                this.streak = JSON.parse(saved);
            } catch(e) {
                console.error('Error cargando racha:', e);
            }
        }
    },
    
    saveStreak: function() {
        localStorage.setItem('su-voz-streak', JSON.stringify(this.streak));
        this.updateStreakUI();
        
        // Notificar al SW sobre el cambio de racha
        this.sendToSW({ 
            type: 'STREAK_UPDATED', 
            streak: this.streak.current 
        });
    },
    
    updateStreak: function(dateStr) {
        const yesterday = this.getYesterdayDateStr();
        const today = dateStr;
        
        if (this.streak.lastReadDate === yesterday) {
            // Día consecutivo
            this.streak.current++;
            if (this.streak.current > this.streak.longest) {
                this.streak.longest = this.streak.current;
                
                // Celebrar hitos
                if (this.streak.current === 7 || this.streak.current === 30 || this.streak.current === 100) {
                    this.showCelebration(this.streak.current);
                }
            }
        } else if (this.streak.lastReadDate !== today && this.streak.lastReadDate !== yesterday) {
            // Racha rota
            this.streak.current = 1;
        }
        // Si ya leyó hoy, no hacer nada
        
        this.streak.lastReadDate = today;
        this.saveStreak();
    },
    
    showCelebration: function(days) {
        const messages = {
            7: '🎉 ¡Una semana completa! Sigue así.',
            30: '🏆 ¡Un mes de constancia! Increíble.',
            100: '🌟 ¡100 días! Eres un ejemplo de dedicación.'
        };
        
        if (messages[days]) {
            this.showToast(messages[days]);
            
            // Confeti sutil si está disponible
            if (typeof confetti === 'function') {
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            }
        }
    },
    
   getYesterdayDateStr: function() {
    const yesterday = new Date();
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
    // CONFIGURACIÓN (MEJORADA CON SW)
    // ========================================
    loadSettings: function() {
        const saved = localStorage.getItem('su-voz-settings');
        if (saved) {
            try {
                this.settings = JSON.parse(saved);
            } catch(e) {
                console.error('Error cargando settings:', e);
            }
        }
    },
    
    saveSettings: function() {
        localStorage.setItem('su-voz-settings', JSON.stringify(this.settings));
        
        // Notificar al SW sobre cambios en notificaciones
        if (this.settings.notificationsEnabled) {
            this.sendToSW({
                type: 'SCHEDULE_NOTIFICATION',
                time: this.settings.reminderTime
            });
        } else {
            this.sendToSW({ type: 'CANCEL_NOTIFICATIONS' });
        }
    },
    
    loadFontSize: function() {
        const saved = localStorage.getItem('reading-size');
        if (saved) {
            this.settings.fontSize = parseFloat(saved);
            document.documentElement.style.setProperty('--reading-size', saved + 'rem');
        } else {
            document.documentElement.style.setProperty('--reading-size', this.settings.fontSize + 'rem');
        }
    },

    loadControlsState: function() {
    const saved = localStorage.getItem('su-voz-controls-collapsed');
    this.controlsCollapsed = saved === 'true';

    if (this.$floatingControls) {
        this.$floatingControls.classList.toggle('collapsed', this.controlsCollapsed);
    }

    if (this.$floatingToggle) {
        this.$floatingToggle.textContent = this.controlsCollapsed ? '☰' : '◀';
    }
},

toggleFloatingControls: function() {
    this.controlsCollapsed = !this.controlsCollapsed;
    localStorage.setItem('su-voz-controls-collapsed', this.controlsCollapsed);

    if (this.$floatingControls) {
        this.$floatingControls.classList.toggle('collapsed', this.controlsCollapsed);
    }

    if (this.$floatingToggle) {
        this.$floatingToggle.textContent = this.controlsCollapsed ? '☰' : '◀';
    }
},

bindFloatingToggle: function() {
    if (this.$floatingToggle) {
        this.$floatingToggle.addEventListener('click', () => {
            this.toggleFloatingControls();
        });
    }
},
    
    // ========================================
    // NOTIFICACIONES (MEJORADAS CON SW)
    // ========================================
    initNotifications: function() {
        if (!('Notification' in window)) {
            console.log('[App] Notificaciones no soportadas');
            return;
        }
        
        // Solicitar permiso si está habilitado
        if (this.settings.notificationsEnabled && Notification.permission === 'default') {
            // Esperar interacción del usuario
            const requestPermission = () => {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        this.sendToSW({
                            type: 'SCHEDULE_NOTIFICATION',
                            time: this.settings.reminderTime
                        });
                    }
                });
                document.removeEventListener('click', requestPermission);
            };
            
            // Solicitar después de un tiempo o al hacer clic
            setTimeout(requestPermission, 5000);
            document.addEventListener('click', requestPermission);
        } else if (this.settings.notificationsEnabled && Notification.permission === 'granted') {
            // Ya tiene permiso, programar notificaciones
            this.sendToSW({
                type: 'SCHEDULE_NOTIFICATION',
                time: this.settings.reminderTime
            });
        }
    },
    
    showDailyReminder: function() {
    // Esta función ahora la maneja el SW
    // Se mantiene por compatibilidad pero se prefiere la del SW
    if (this.settings.notificationsEnabled && Notification.permission === 'granted') {
        const todayStr = this.getTodayDateStr();
        if (!this.isRead(todayStr)) {
            new Notification('📖 Su Voz a Diario', {
                body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
                icon: '/icons/icon-192.png',
                vibrate: [200, 100, 200],
                data: { url: '/#home' }
            });
        }
    }
},

checkReminderOnOpen: function() {
    if (!this.settings.notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const todayStr = this.getTodayDateStr();

    if (this.isRead(todayStr)) return;

    const alreadyShown = localStorage.getItem('su-voz-last-reminder-date');
    if (alreadyShown === todayStr) return;

    const [hour, minute] = (this.settings.reminderTime || '08:00').split(':').map(Number);

    const now = new Date();
    const reminderTime = new Date();
    reminderTime.setHours(hour, minute, 0, 0);

    if (now >= reminderTime) {
        new Notification('📖 Su Voz a Diario', {
            body: '¿Ya escuchaste Su voz hoy? Tómate un momento para escucharle.',
            icon: './icons/icon-192.png'
        });

        localStorage.setItem('su-voz-last-reminder-date', todayStr);
    }
},
    
    // ========================================
    // ESTADÍSTICAS (MEJORADAS)
    // ========================================
    getStats: function() {
        const readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        const totalRead = readDates.length;
        const totalAvailable = this.data.length;
        
        // Calcular días consecutivos actuales (más preciso)
        let currentStreak = 0;
        let checkDate = new Date();
        
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
                if (note.dios?.trim() || note.aprendizaje?.trim() || note.respuesta?.trim()) {
                    totalNotes++;
                }
            }
        }
        
        // Resaltados totales
        let totalHighlights = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('su-voz-highlights-')) {
                const highlights = JSON.parse(localStorage.getItem(key));
                totalHighlights += highlights.length;
            }
        }
        
        return {
            totalRead,
            totalAvailable,
            percentage,
            currentStreak,
            longestStreak: this.streak.longest,
            totalNotes,
            totalHighlights
        };
    },
    
    // ========================================
    // FUNCIONES PRINCIPALES
    // ========================================
    markAsRead: function(dateStr) {
        let readDates = JSON.parse(localStorage.getItem('su-voz-read-dates')) || [];
        if (!readDates.includes(dateStr)) {
            readDates.push(dateStr);
            localStorage.setItem('su-voz-read-dates', JSON.stringify(readDates));
            this.updateStreak(dateStr);
            
            // Feedback háptico
            if ('vibrate' in navigator) {
                navigator.vibrate(50);
            }
            
            // Mostrar celebración si es el primer día
            if (readDates.length === 1) {
                this.showToast('🎉 ¡Primera lectura! ¡Felicidades!');
            }
            
            // Notificar al SW
            this.sendToSW({ type: 'READING_COMPLETED', date: dateStr });
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
        const normalized = [...new Set(
            highlights
                .map(h => (h || '').trim())
                .filter(Boolean)
        )];

    localStorage.setItem(this.getHighlightsKey(dateStr), JSON.stringify(normalized));
    this.sendToSW({ type: 'HIGHLIGHTS_UPDATED', date: dateStr });
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
        return (note.dios?.trim().length > 0) ||
               (note.aprendizaje?.trim().length > 0) ||
               (note.respuesta?.trim().length > 0);
    },
    
    saveNote: function(dateStr, noteObj) {
        localStorage.setItem(this.getNoteKey(dateStr), JSON.stringify(noteObj));
        this.sendToSW({ type: 'NOTE_SAVED', date: dateStr });
    },
    
    deleteNote: function(dateStr) {
        localStorage.removeItem(this.getNoteKey(dateStr));
        this.showToast('Reflexión eliminada');
    },
    
    toggleNote: function(dateStr) {
        this.openNoteDate = this.openNoteDate === dateStr ? null : dateStr;
    },
    
    changeFontSize: function(delta) {
        let current = this.settings.fontSize;
        current += delta;
        if (current < 0.9) current = 0.9;
        if (current > 1.6) current = 1.6;
        
        this.settings.fontSize = current;
        localStorage.setItem('reading-size', current);
        document.documentElement.style.setProperty('--reading-size', current + 'rem');
        this.saveSettings();
        
        // Re-renderizar
        if (this.currentView === 'reading' || this.currentView === 'home') {
            this.scheduleRender();
        }
    },
    
    scheduleRender: function() {
        if (this.renderScheduled) return;
        this.renderScheduled = true;
        requestAnimationFrame(() => {
            this.handleRoute();
            this.renderScheduled = false;
        });
    },
    
    showToast: function(message, duration = 3000) {
        // Eliminar toast existente
        const existing = document.querySelector('.toast-message');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
   exportReflectionPDF: function(dateStr) {
    const reading = this.data.find(r => r.date === dateStr);
    if (!reading) return;

    const note = this.getNote(dateStr);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const marginLeft = 20;
    const marginTop = 20;
    const marginBottom = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - marginLeft * 2;

    let y = marginTop;

    const ensureSpace = (needed = 12) => {
        if (y + needed > pageHeight - marginBottom) {
            doc.addPage();
            y = marginTop;
        }
    };

    const addSectionTitle = (title) => {
        ensureSpace(12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(title, marginLeft, y);
        y += 6;
    };

    const addParagraph = (text) => {
        const content = (text && text.trim()) ? text : 'Sin contenido.';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);

        const lines = doc.splitTextToSize(content, usableWidth);

        lines.forEach(line => {
            ensureSpace(6);
            doc.text(line, marginLeft, y);
            y += 6;
        });

        y += 4;
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Su voz a diario', marginLeft, y);

    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(`Fecha: ${this.formatDateEs(dateStr)}`, marginLeft, y);

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Pasaje: ${reading.reference}`, marginLeft, y);

    y += 14;
    doc.setFontSize(14);
    doc.text('Mi reflexión', marginLeft, y);
    y += 10;

    addSectionTitle('Lo que veo de Dios');
    addParagraph(note.dios);

    addSectionTitle('Lo que aprendo del pasaje');
    addParagraph(note.aprendizaje);

    addSectionTitle('Mi respuesta hoy');
    addParagraph(note.respuesta);

    doc.save(`reflexion-${dateStr}.pdf`);
    this.showToast('Se abrió el PDF para descargar');
    },
    
    resetReadingMode: function() {
    this.readingMode = false;
    this.lastReadingTap = 0;
    document.body.classList.remove('reading-mode');
    },
    
   showNoteSavedMessage: function(dateStr) {
    this.noteSavedMessageDate = dateStr;
    clearTimeout(this.noteSavedTimeout);

    const msg = document.querySelector('.note-saved-message');
    if (msg) {
        msg.style.display = 'block';
    }

    this.noteSavedTimeout = setTimeout(() => {
        this.noteSavedMessageDate = null;

        const msg = document.querySelector('.note-saved-message');
        if (msg) {
            msg.style.display = 'none';
        }
    }, 1200);
},
    
    escapeRegExp: function(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
    
    removeHighlightButton: function() {
        const existing = document.getElementById('highlight-btn');
        if (existing) existing.remove();
    },

    restoreHighlightsInDOM: function(dateStr) {
    const container = document.querySelector('.reading-text');
    if (!container) return;

    const highlights = this.getHighlights(dateStr);
    if (!highlights.length) return;

    highlights.forEach(text => {
        this.highlightTextInElement(container, text);
    });
},

highlightTextInElement: function(container, text) {
    if (!text || !text.trim()) return;

    const searchText = text.trim().toLowerCase();
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }

                if (node.parentNode && node.parentNode.closest('mark.user-highlight')) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const matches = [];
    let node;

    while ((node = walker.nextNode())) {
        const original = node.nodeValue;
        const lower = original.toLowerCase();
        let startIndex = 0;
        let index;

        while ((index = lower.indexOf(searchText, startIndex)) !== -1) {
            matches.push({
                node,
                index,
                length: text.length
            });
            startIndex = index + text.length;
        }
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const { node, index, length } = matches[i];

        if (!node.parentNode) continue;

        const original = node.nodeValue;
        const before = original.slice(0, index);
        const match = original.slice(index, index + length);
        const after = original.slice(index + length);

        const fragment = document.createDocumentFragment();

        if (before) fragment.appendChild(document.createTextNode(before));

        const mark = document.createElement('mark');
        mark.className = 'user-highlight';
        mark.textContent = match;
        fragment.appendChild(mark);

        if (after) fragment.appendChild(document.createTextNode(after));

        node.parentNode.replaceChild(fragment, node);
    }
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
             if (selectedText.length < 3) {
                this.showToast('Selecciona un texto un poco más largo');
                selection.removeAllRanges();
                this.removeHighlightButton();
                return;
            }
            
            const highlights = this.getHighlights(dateStr);
            if (!highlights.includes(selectedText)) {
                highlights.push(selectedText);
                this.saveHighlights(dateStr, highlights);
                this.showToast('Texto resaltado');
            }
            selection.removeAllRanges();
            this.removeHighlightButton();
            this.scheduleRender();
        });
        
        document.body.appendChild(btn);
    },
    
    // ========================================
    // NAVEGACIÓN Y RENDERIZADO
    // ========================================
    loadData: async function() {
        try {
            const response = await fetch('data/readings.json');
            if (!response.ok) throw new Error('Error al cargar lecturas');
            this.data = await response.json();
            this.data.sort((a, b) => new Date(a.date) - new Date(b.date));
        } catch (error) {
            console.error('Error loading data:', error);
            this.$content.innerHTML = `
                <div class="empty-state">
                    <h3>⚠️ No se pudieron cargar las lecturas</h3>
                    <p>Por favor, verifica tu conexión a internet.</p>
                    <button class="btn-primary" onclick="location.reload()">Reintentar</button>
                </div>
            `;
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
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
        
        if (!reading) {
            this.$content.innerHTML = `
                <div class="empty-state">
                    <h3>📖 No hay lectura programada para este día</h3>
                    <br>
                    <button class="btn-primary" data-nav="calendar">Ver calendario de lecturas</button>
                </div>
            `;
            return;
        }
        
        const dateFormatted = this.formatDateEs(reading.date);
        const readingText = reading.versions?.[this.currentVersion] || reading.text || '';
        
           this.$content.innerHTML = `
                <div class="reading-date-header">${dateFormatted.toUpperCase()}</div>
    
                <div class="reading-card">
                    <div class="section-title">📖 Su voz ${isHome ? 'hoy' : 'este día'}</div>
                    <h2 class="reading-reference">${reading.reference}</h2>
                    <div class="reading-text" data-reading-date="${reading.date}">
                        ${readingText}
                    </div>
               </div>
            
            <div class="main-action">
                <button class="btn-secondary ${this.hasNote(reading.date) ? 'has-note' : ''}" data-action="toggle-note" data-date="${reading.date}">
                    ${this.openNoteDate === reading.date ? '📝 Cerrar reflexión' : '📝 Mi reflexión'}
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
                    <div class="note-saved-message" style="display: none;">✓ Guardado automáticamente</div>
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
            this.restoreHighlightsInDOM(reading.date);
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    renderCalendar: function() {
        if (this.data.length === 0) {
            this.$content.innerHTML = `<div class="empty-state">📅 No hay lecturas disponibles.</div>`;
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
                        ${this.isRead(item.date) ? '<span class="read-badge" title="Leído">✓</span>' : ''}
                        ${this.hasNote(item.date) ? '<span class="note-badge" title="Tiene reflexión">📝</span>' : ''}
                        ${this.hasHighlights(item.date) ? '<span class="highlight-badge" title="Tiene resaltados">✨</span>' : ''}
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
                    <div class="stat-note">🏆 Récord: ${stats.longestStreak} días</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">📝 ${stats.totalNotes}</div>
                    <div class="stat-label">Reflexiones escritas</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-number">✨ ${stats.totalHighlights}</div>
                    <div class="stat-label">Versículos resaltados</div>
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
                        <label>⏰ Recordatorio diario</label>
                        <div class="setting-control">
                            <input type="time" id="reminder-time" value="${this.settings.reminderTime}" class="time-input">
                            <button id="test-notification" class="btn-secondary">Probar</button>
                        </div>
                    </div>
                    <div class="setting-item">
                        <label>📢 Activar notificaciones</label>
                        <label class="switch">
                            <input type="checkbox" id="notifications-toggle" ${this.settings.notificationsEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="setting-card">
                    <h3>🎨 Apariencia</h3>
                    <div class="setting-item">
                        <label>🌓 Tema oscuro</label>
                        <button id="theme-toggle-settings" class="btn-secondary">Cambiar tema</button>
                    </div>
                </div>
                
                <div class="setting-card">
                    <h3>💾 Datos</h3>
                    <div class="setting-item">
                        <button id="export-data" class="btn-secondary">📤 Exportar mis datos</button>
                        <button id="import-data" class="btn-secondary">📥 Importar respaldo</button>
                    </div>
                    <div class="setting-item">
                        <button id="reset-data" class="btn-secondary danger">⚠️ Reiniciar todo</button>
                    </div>
                    <input type="file" id="import-file" accept=".json" style="display: none;">
                </div>
                
                <div class="setting-card">
                    <h3>ℹ️ Acerca de</h3>
                    <p><strong>Su Voz a Diario</strong> v2.1</p>
                    <p>Meditación bíblica diaria con reflexiones personales</p>
                    <p>📖 Lecturas diarias para crecer espiritualmente</p>
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
        const themeToggleSettings = document.getElementById('theme-toggle-settings');
        
        if (reminderTime) {
            reminderTime.addEventListener('change', (e) => {
                this.settings.reminderTime = e.target.value;
                this.saveSettings();
                this.showToast('Hora de recordatorio actualizada');
            });
        }
        
        if (notificationsToggle) {
            notificationsToggle.addEventListener('change', async (e) => {
            this.settings.notificationsEnabled = e.target.checked;

        if (this.settings.notificationsEnabled && Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();

            if (permission !== 'granted') {
                this.settings.notificationsEnabled = false;
                e.target.checked = false;
                this.saveSettings();
                this.showToast('No se concedió permiso para notificaciones');
                return;
                    }
                }

                this.saveSettings();
                this.showToast(this.settings.notificationsEnabled ? 'Notificaciones activadas' : 'Notificaciones desactivadas');
            });
        }
        
        if (testNotification) {
            testNotification.addEventListener('click', () => {
                if (Notification.permission === 'granted') {
                    new Notification('Su Voz a Diario', {
                        body: '¡Las notificaciones funcionan correctamente!',
                        icon: '/icons/icon-192.png'
                    });
                    this.showToast('Notificación de prueba enviada');
                } else {
                    Notification.requestPermission().then(perm => {
                        if (perm === 'granted') {
                            this.showToast('Permiso concedido. Prueba de nuevo.');
                        }
                    });
                }
            });
        }
        
        if (themeToggleSettings) {
            themeToggleSettings.addEventListener('click', () => {
                const toggleBtn = document.getElementById('theme-toggle');
                if (toggleBtn) toggleBtn.click();
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
                if (confirm('⚠️ ¿Estás seguro? Se borrarán TODOS tus datos:\n- Lecturas marcadas\n- Rachas\n- Reflexiones\n- Resaltados\n\nEsta acción no se puede deshacer.')) {
                    this.resetAllData();
                }
            });
        }
    },
    
    exportAllData: function() {
        const allData = {
            version: '2.1',
            exportDate: new Date().toISOString(),
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
        
        this.showToast('Datos exportados correctamente');
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
                    this.settings = { ...this.settings, ...data.settings };
                    this.saveSettings();
                    // Recargar configuración visual
                    this.initTheme();
                    this.loadFontSize();
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
                
                this.showToast('✅ Datos importados correctamente');
                setTimeout(() => location.reload(), 1500);
            } catch (error) {
                console.error('Error importando:', error);
                alert('Error al importar: archivo inválido o corrupto');
            }
        };
        reader.readAsText(file);
    },
    
    resetAllData: function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('su-voz-') || key === 'theme' || key === 'reading-size' || key === 'current-version')) {
                keys.push(key);
            }
        }
        keys.forEach(key => localStorage.removeItem(key));
        
        // Reiniciar estado
        this.streak = { current: 0, longest: 0, lastReadDate: null };
        this.saveStreak();
        this.settings = {
            reminderTime: '08:00',
            notificationsEnabled: true,
            autoSaveNotes: true,
            fontSize: 1.08
        };
        this.saveSettings();
        
        this.showToast('🗑️ Todos los datos han sido reiniciados');
        setTimeout(() => location.reload(), 1000);
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
        
        // Controles de fuente y versión
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="font-increase"]')) {
                this.changeFontSize(0.05);
            }
            if (e.target.closest('[data-action="font-decrease"]')) {
                this.changeFontSize(-0.05);
            }
            
            const versionBtn = e.target.closest('[data-version]');
            if (versionBtn) {
                this.currentVersion = versionBtn.getAttribute('data-version');
                localStorage.setItem('current-version', this.currentVersion);
                document.querySelectorAll('.version-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-version') === this.currentVersion);
                });
                this.handleRoute();
                this.showToast(`Versión cambiada a ${this.currentVersion.toUpperCase()}`);
            }
        });
        
        // Eventos del contenido
        this.$content.addEventListener('click', (e) => {
            // Activar modo lectura solo si se hace clic directo en el bloque,
            // no cuando se está seleccionando texto
            const readingEl = e.target.closest('.reading-text');
            if (readingEl) {
                const selection = window.getSelection();
                if (selection && selection.toString().trim()) {
                return;
                }

                const now = Date.now();
                const date = readingEl.getAttribute('data-reading-date');

                if (now - this.lastReadingTap < this.readingTapDelay) {
                this.readingMode = !this.readingMode;
                document.body.classList.toggle('reading-mode', this.readingMode);
                this.lastReadingTap = 0;

                    if (date) {
                        this.renderReading(date);
                    }
                } else {
                    this.lastReadingTap = now;
                }

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
        const rawHtml = reading.versions?.[this.currentVersion] || reading.text || '';

        const cleanText = rawHtml
            .replace(/<\/p>\s*<p>/g, '\n\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();

        const shareText = `📖 SU VOZ A DIARIO
━━━━━━━━━━
Pasaje: ${reading.reference}
Versión: ${this.currentVersion.toUpperCase()}
━━━━━━━━━━

${cleanText}

━━━━━━━━━━
Compartido desde Su voz a diario`;

       if (navigator.share) {
           navigator.share({ title: 'Su voz a diario', text: shareText })
                .catch(() => {});
       } else if (navigator.clipboard) {
            navigator.clipboard.writeText(shareText).then(() => this.showToast('Lectura copiada al portapapeles'));
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
                this.showToast('Resaltados eliminados');
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
        
        const applyTheme = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-mode');
                document.body.classList.remove('light-mode');
                if (toggleBtn) toggleBtn.textContent = '☀️';
            } else {
                document.body.classList.remove('dark-mode');
                document.body.classList.add('light-mode');
                if (toggleBtn) toggleBtn.textContent = '🌙';
            }
        };
        
        if (savedTheme === 'dark') {
            applyTheme(true);
        } else if (savedTheme === 'light') {
            applyTheme(false);
        } else {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(systemDark);
        }
        
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const isDark = document.body.classList.contains('dark-mode');
                applyTheme(!isDark);
                localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                this.showToast(!isDark ? 'Modo oscuro activado' : 'Modo claro activado');
            });
        }
    }
};

// Inicializar la app
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
