import { API_URL, DOM, playerProfile } from './config.js';
import { openModal } from './cards.js';

export async function renderDeckGrid() {
    const realDeckGrid = document.querySelector('.deck-grid');
    if (!realDeckGrid || !playerProfile) {
        console.error("Сетка колоды (.deck-grid) или профиль игрока не найдены!");
        return;
    }

    realDeckGrid.innerHTML = '';

    try {
        const response = await fetch(`${API_URL}/deck/${playerProfile.user_id}`);
        const data = await response.json();

        const allCards = data.all_cards || [];
        const userCards = data.user_cards || [];

        if (allCards.length === 0) {
            realDeckGrid.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; grid-column: 1/-1;">В базе данных нет карт!</div>`;
            return;
        }
        allCards.sort((a, b) => a.id - b.id);
        
        allCards.forEach(card => {
            const owned = userCards.find(uc => String(uc.card_id) === String(card.id));
            const container = document.createElement('div');
            
            container.className = owned ? 'card-container' : 'card-container card-locked';
            container.style.width = "100%";
            container.style.height = "120px"; 
            container.style.position = "relative";
            container.style.pointerEvents = "auto";
            container.style.zIndex = "90";
            container.setAttribute('data-card-id', card.id); // МУСОРНАЯ СТРОКА УДАЛЕНА

            if (owned) {
                container.innerHTML = `
                    <div class="card-inner" style="transform: rotateY(180deg); width:100%; height:100%; pointer-events: none;">
                        <div class="card-back" style="width:100%; height:100%; position:absolute; pointer-events: none;">
                            <img class="card-image-bg" src="${card.image_url || ''}" style="pointer-events: none;">
                            <div class="card-content" style="pointer-events: none;">
                                <div class="card-title" style="font-size:0.55rem; pointer-events: none;">${card.title || 'Без имени'}</div>
                                <div class="card-rarity" style="font-size:0.5rem; pointer-events: none;">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                            </div>
                            <div class="card-badge" style="pointer-events: none;">x${owned.quantity || 1}</div>
                        </div>
                    </div>`;
                
                container.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openModal(card);
                });
            } else {
                container.innerHTML = `
                    <div class="card-inner" style="transform: rotateY(180deg); width:100%; height:100%; pointer-events: none;">
                        <div class="card-back" style="width:100%; height:100%; position:absolute; pointer-events: none;">
                            <div class="card-content" style="pointer-events: none;">
                                <div class="card-title" style="font-size:0.55rem; pointer-events: none;">${card.title || '???'}</div>
                                <div class="card-rarity" style="font-size:0.5rem; pointer-events: none;">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
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
