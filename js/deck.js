import { DOM, playerProfile, apiFetch } from './config.js';
import { openModal } from './cards.js';

// Флаг для предотвращения одновременных повторных запросов
let isDeckLoading = false;

export async function renderDeckGrid() {
    const realDeckGrid = document.querySelector('.deck-grid');
    if (!realDeckGrid || !playerProfile) {
        console.error("Сетка колоды (.deck-grid) или профиль игрока не найдены!");
        return;
    }

    // Если колода уже загружается прямо сейчас, игнорируем повторный вызов
    if (isDeckLoading) return;
    isDeckLoading = true;

    // Временно пишем, что идет загрузка, чтобы пользователь видел отклик
    realDeckGrid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">Загрузка колоды...</div>`;

    try {
        const response = await apiFetch('/api/deck');
        if (!response.ok) throw new Error('Ошибка сервера при получении колоды');
        
        const data = await response.json();
        const allCards = data.all_cards || [];
        const userCards = data.user_cards || [];

        // Очищаем индикатор загрузки строго перед выводом карточек
        realDeckGrid.innerHTML = '';

        if (allCards.length === 0) {
            realDeckGrid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">В базе данных нет карт!</div>`;
            return;
        }
        
        // Сортируем карты по ID
        allCards.sort((a, b) => a.id - b.id);
        
        allCards.forEach(card => {
            const owned = userCards.find(uc => String(uc.card_id) === String(card.id));
            const container = document.createElement('div');
            
            container.className = owned ? 'card-container' : 'card-container card-locked';
            
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
        realDeckGrid.innerHTML = `<div style="color:#ff6b6b; text-align:center; padding:20px; grid-column: 1/-1;">Не удалось загрузить карты...</div>`;
    } finally {
        // В любом случае снимаем блокировку загрузки
        isDeckLoading = false;
    }
}
