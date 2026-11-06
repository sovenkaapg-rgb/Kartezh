import { DOM, playerProfile, apiFetch } from './config.js';
import { openModal } from './swipe.js';

let isDeckLoading = false;
let deckCache = null; // { allCards, userCards }

function rarityClassOf(card) {
    const r = (card.rarity || '').toLowerCase();
    if (r === 'редкая' || r === 'редк') return 'rare';
    if (r === 'лега' || r === 'легендарная') return 'legendary';
    return 'common';
}

function ownedHtml(card, quantity) {
    const rc = rarityClassOf(card);
    const glare = rc === 'legendary' ? '<div class="legendary-glare"></div>' : '';
    return `
        <div class="card-inner" style="transform: none !important;">
            <div class="card-back rarity-${rc}" style="transform: rotateY(0deg) !important; position: relative !important;">
                <img class="card-image-bg" src="${card.image_url || ''}">
                <div class="card-frame-border"></div>
                <div class="card-id-badge">${card.id || '?'}</div>
                <div class="card-text-plate">
                    <div class="card-title-text">${card.title || 'Без имени'}</div>
                    <div class="card-rarity-text">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                </div>
                ${glare}
            </div>
            ${quantity > 1 ? `<div class="card-badge">x${quantity}</div>` : ''}
        </div>`;
}

function lockedHtml(card) {
    const rc = rarityClassOf(card);
    return `
        <div class="card-inner" style="transform: none !important;">
            <div class="card-back rarity-${rc}" style="transform: rotateY(0deg) !important; position: relative !important;">
                <img class="card-image-bg" src="${card.image_url || ''}">
                <div class="card-frame-border"></div>
                <div class="card-text-plate">
                    <div class="card-title-text">???</div>
                    <div class="card-rarity-text">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                </div>
            </div>
        </div>`;
}

function buildGrid(grid, allCards, userCards) {
    const sorted = [...allCards].sort((a, b) => a.id - b.id);
    const frag = document.createDocumentFragment();
    sorted.forEach(card => {
        const owned = userCards.find(uc => String(uc.card_id) === String(card.id));
        const el = document.createElement('div');
        el.dataset.cardId = card.id;
        if (owned) {
            el.className = 'card-container';
            el.innerHTML = ownedHtml(card, owned.quantity || 1);
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openModal({ ...card, quantity: owned.quantity || 1 });
            });
        } else {
            el.className = 'card-container card-locked';
            el.innerHTML = lockedHtml(card);
        }
        frag.appendChild(el);
    });
    grid.replaceChildren(frag);
}

export async function renderDeckGrid() {
    const grid = document.querySelector('.deck-grid');
    if (!grid || !playerProfile || isDeckLoading) return;
    isDeckLoading = true;

    // Есть кэш — показываем сразу, без «Загрузки»
    if (deckCache) {
        buildGrid(grid, deckCache.allCards, deckCache.userCards);
    } else {
        grid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">Загрузка колоды...</div>`;
    }

    try {
        const response = await apiFetch('/api/deck');
        if (!response.ok) throw new Error('Ошибка сервера при получении колоды');
        const data = await response.json();
        const fresh = { allCards: data.all_cards || [], userCards: data.user_cards || [] };

        if (fresh.allCards.length === 0) {
            grid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">В базе данных нет карт!</div>`;
            return;
        }
        // Перерисовываем только если что-то реально изменилось
            const changed = !deckCache
                || deckCache.allCards.length !== fresh.allCards.length
                || JSON.stringify(deckCache.userCards) !== JSON.stringify(fresh.userCards);
            if (changed) {
                const scroll = DOM.deckScreen?.scrollTop || 0;
                buildGrid(grid, fresh.allCards, fresh.userCards);
                if (DOM.deckScreen) DOM.deckScreen.scrollTop = scroll;
                deckCache = fresh;}

    } catch (error) {
        console.error("Ошибка при выполнении renderDeckGrid:", error);
        if (!deckCache) {
            grid.innerHTML = `<div style="color:#ff6b6b; text-align:center; padding:20px; grid-column: 1/-1;">Не удалось загрузить карты...</div>`;
        }
    } finally {
        isDeckLoading = false;
    }
}

// Сожгли карту: правим одну плитку на месте, без запроса и перерисовки
export function applyBurn(cardId) {
    if (!deckCache) return;
    const uc = deckCache.userCards.find(u => String(u.card_id) === String(cardId));
    if (!uc) return;
    uc.quantity = (uc.quantity || 1) - 1;

    const card = deckCache.allCards.find(c => String(c.id) === String(cardId));
    const el = document.querySelector(`.deck-grid [data-card-id="${cardId}"]`);
    if (uc.quantity <= 0) {
        deckCache.userCards = deckCache.userCards.filter(u => u !== uc);
        if (el && card) {
            el.className = 'card-container card-locked';
            el.innerHTML = lockedHtml(card);
            el.replaceWith(el.cloneNode(true)); // снимаем старый обработчик клика
        }
    } else if (el && card) {
        el.innerHTML = ownedHtml(card, uc.quantity);
    }
}

// Новая карта из «Моей колоды» на столе: следующий вход перечитает всё
export function invalidateDeck() { deckCache = null; }


