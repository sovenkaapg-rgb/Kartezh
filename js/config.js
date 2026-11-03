export const API_URL = "http://127.0.0.1:8000"; 

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
