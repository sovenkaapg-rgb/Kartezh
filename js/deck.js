import { DOM, playerProfile, apiFetch } from './config.js';
import { openModal } from './cards.js';

export async function renderDeckGrid() {
    const realDeckGrid = document.querySelector('.deck-grid');
    if (!realDeckGrid || !playerProfile) {
        console.error("Сетка колоды (.deck-grid) или профиль игрока не найдены!");
        return;
    }

    realDeckGrid.innerHTML = '';

    try {
        const response = await apiFetch('/api/deck');
        const data = await response.json();

        const allCards = data.all_cards || [];
        const userCards = data.user_cards || [];

        if (allCards.length === 0) {
            realDeckGrid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">В базе данных нет карт!</div>`;
            return;
        }
        
        // Сортируем карты по ID, чтобы они шли по порядку
        allCards.sort((a, b) => a.id - b.id);
        
        allCards.forEach(card => {
            const owned = userCards.find(uc => String(uc.card_id) === String(card.id));
            const container = document.createElement('div');
            
            // Если карта не выбита, вешаем класс блокировки card-locked
            container.className = owned ? 'card-container' : 'card-container card-locked';
            
            // Определяем класс редкости
            let rarityClass = 'common';
            if (card.rarity) {
                const r = card.rarity.toLowerCase();
                if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
                if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
            }
            const isLegendary = rarityClass === 'legendary';
            const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';
            const quantity = owned ? (owned.quantity || 1) : 0;

            if (owned) {
                // Карточка выбита: показываем лицо.
                // ВАЖНО: В CSS .card-back имеет rotateY(180deg), поэтому для отображения в сетке
                // мы принудительно гасим внутренний разворот через rotateY(0deg) прямо у .card-back
                container.innerHTML = `
                    <div class="card-inner" style="transform: none !important;">
                        <div class="card-back rarity-${rarityClass}" style="transform: rotateY(0deg) !important; position: relative !important;">
                            <img class="card-image-bg" src="${card.image_url || ''}">
                            <div class="card-frame-border"></div>
                            <div class="card-id-badge">${card.id || '?'}</div>
                            <div class="card-text-plate">
                                <div class="card-title-text">${card.title || 'Без имени'}</div>
                                <div class="card-rarity-text">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                            </div>
                            ${glareHtml}
                        </div>
                        ${quantity > 1 ? `<div class="card-badge">x${quantity}</div>` : ''}
                    </div>`;
                
                container.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openModal(card);
                });
            } else {
                // Карточка скрыта (не выбита): рисуем пустую рамку с вопросиками и ч/б силуэтом
                container.innerHTML = `
                    <div class="card-inner" style="transform: none !important;">
                        <div class="card-back rarity-${rarityClass}" style="transform: rotateY(0deg) !important; position: relative !important;">
                            <img class="card-image-bg" src="${card.image_url || ''}">
                            <div class="card-frame-border"></div>
                            <div class="card-text-plate">
                                <div class="card-title-text">???</div>
                                <div class="card-rarity-text">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                            </div>
                        </div>
                    </div>`;
            }
            realDeckGrid.appendChild(container);
        });
    } catch (error) { 
        console.error("Ошибка при выполнении renderDeckGrid:", error); 
    }
}
