const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
export const API_URL = isLocal
    ? "http://127.0.0.1:8000"
    : "https://retrogule.pythonanywhere.com";

export const tg = window.Telegram?.WebApp || null;
export let user = { id: null, username: null };
export let playerProfile = null;
export const isDrawing = { value: false }; // Обернули в объект для реактивности ссылок в модулях

export function setPlayerProfile(data) { playerProfile = data; }
export function setUser(data) { user = data; }

export const DOM = {
    authOverlay: document.getElementById('auth-overlay'),
    manualInput: document.getElementById('manual-username'),
    manualLoginBtn: document.getElementById('btn-manual-login'),
    
    coinBalanceEl: document.querySelector('.coin-amount'), 
    timeLeftEl: document.querySelector('.cooldown-box'),   
    buyHourBtn: document.querySelector('.btn-buy-hour'),
    hourglassIcon: document.querySelector('.spinning-hourglass-wrapper'), 
    
    speechBubbleEl: document.querySelector('.bot-speech-bubble'),
    affinityFillEl: document.querySelector('.affinity-bar-fill'),
    affinityLabelEl: document.querySelector('.affinity-header'),
    cardsDropZone: document.querySelector('.cards-drop-zone'),
    deckScreen: document.querySelector('.deck-screen'),
    deckGrid: document.querySelector('.deck-grid'),
    cardModal: document.querySelector('.card-modal')
};

export function refreshDOM() {
    DOM.coinBalanceEl = document.querySelector('.coin-amount');
    DOM.timeLeftEl = document.querySelector('.cooldown-box');
    DOM.buyHourBtn = document.querySelector('.btn-buy-hour');
    DOM.hourglassIcon = document.querySelector('.spinning-hourglass');
    DOM.affinityFillEl = document.querySelector('.affinity-bar-fill');
    DOM.affinityLabelEl = document.querySelector('.affinity-header');
}
export let authToken = null;
export function setAuthToken(t) { authToken = t; }

// Все запросы к игровому API идут через эту функцию
export function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    
    return fetch(`${API_URL}${path}`, { 
        ...options, 
        headers: headers // Явно принудительно прописываем собранные headers
    });
}


// Вибрация только там, где она поддерживается (убирает предупреждение в консоли)
export function haptic(kind, type) {
    try {
        if (localStorage.getItem('haptics_disabled') === 'true') return; // <--- ДОБАВИТЬ ЭТУ СТРОКУ
        if (tg && tg.initData && typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('6.1')) {
            tg.HapticFeedback?.[kind]?.(type);
        }
    } catch (e) {
        console.log("Haptic не поддерживается окружением");
    }
}


// Включает прелоадер: крутит часы и блокирует клики по экрану
export function showLoader() {
    document.body.style.pointerEvents = 'none'; // Блокируем абсолютно все клики на экране
    if (DOM.hourglassIcon) {
        DOM.hourglassIcon.classList.add('hourglass-fast-spin'); // Запускаем быстрый оборот из CSS
    }
}

// Выключает прелоадер: возвращает всё в исходное состояние
export function hideLoader() {
    document.body.style.pointerEvents = 'auto'; // Возвращаем клики
    if (DOM.hourglassIcon) {
        DOM.hourglassIcon.classList.remove('hourglass-fast-spin'); // Возвращаем стандартную анимацию
    }
}

export function toast(text, ms = 2400) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
export function askNotifyPermissionOnce() {
    try {
        if (!tg?.initData || !tg.requestWriteAccess || !tg.isVersionAtLeast?.('6.9')) return;
        if (tg.initDataUnsafe?.user?.allows_write_to_pm) return;   // уже разрешено
        if (localStorage.getItem('notify_asked')) return;
        localStorage.setItem('notify_asked', '1');
        tg.requestWriteAccess(() => {});
    } catch (e) { /* не критично */ }
}