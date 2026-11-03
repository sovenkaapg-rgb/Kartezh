export const API_URL = "https://retrogule.pythonanywhere.com/api";

export const tg = window.Telegram?.WebApp || null;
export let user = { id: null, username: null };
export let playerProfile = null;
export const isDrawing = { value: false }; 
export const initData = window.Telegram?.WebApp?.initData || "";

export function setPlayerProfile(data) { playerProfile = data; }
export function setUser(data) { user = data; }

export const DOM = {
    authOverlay: document.getElementById('auth-overlay'),
    manualInput: document.getElementById('manual-username'),
    manualLoginBtn: document.getElementById('btn-manual-login'),
    coinBalanceEl: document.querySelector('.coin-balance span') || document.getElementById('balance'),
    timeLeftEl: document.getElementById('time-left'),
    buyHourBtn: document.querySelector('.btn-buy-hour'),
    hourglassIcon: document.querySelector('.icon-hourglass'),
    speechBubbleEl: document.querySelector('.bot-speech-bubble'),
    affinityFillEl: document.querySelector('.affinity-bar-fill'),
    affinityLabelEl: document.querySelector('.affinity-header span:last-child'),
    cardsDropZone: document.querySelector('.cards-drop-zone'),
    deckScreen: document.querySelector('.deck-screen'),
    deckGrid: document.querySelector('.deck-grid'),
    cardModal: document.querySelector('.card-modal')
};
