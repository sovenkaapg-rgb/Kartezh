import { DOM, playerProfile, isDrawing, apiFetch, haptic, askNotifyPermissionOnce } from './config.js';
import { initSwipeMechanic } from './swipe.js';

// Проверка кулдауна
export function checkCooldownStatus() {
    if (!playerProfile) return;
    // Жёсткая блокировка: если карта уже выбрана или в процессе, ничего не перерисовываем!
    if (isDrawing.value === true) return; 
    if (document.querySelector('.card-zoom-and-fly') || document.querySelector('.inline-action-buttons')) return;
    
    askNotifyPermissionOnce();
    
    const last = playerProfile.last_pack_opened;
    const diff = last ? new Date(last).getTime() + 4 * 3600000 - Date.now() : 0;

    if (diff > 0) {
        DOM.cardsDropZone.innerHTML = '';
        return;
    }

    if (DOM.timeLeftEl.textContent === "Готово!" || DOM.timeLeftEl.textContent === "00ч 00м 00с" || diff <= 0) {
        if (document.querySelector('.inline-action-buttons') || document.querySelector('.card-zoom-and-fly')) {
            return;
        }
        if (!DOM.cardsDropZone.querySelector('.card-container')) {
            renderThreeClosedCards();
        }
    }
}

// Отрисовка 3-х карт на столе
export function renderThreeClosedCards() {
    isDrawing.value = false; 
       if (document.querySelector('.card-zoom-and-fly') || document.querySelector('.inline-action-buttons')) {
        return;
    }
    
    DOM.cardsDropZone.innerHTML = '';
    const sceneOverlay = document.querySelector('.scene-dark-overlay');
    
    if (sceneOverlay) sceneOverlay.classList.remove('active');

    for (let i = 1; i <= 3; i++) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container closed-choice-card card-enter-left';
        cardContainer.innerHTML = `<div class="card-inner"><div class="card-front"></div></div>`;
        cardContainer.addEventListener('click', () => handleCardClick(cardContainer));
        DOM.cardsDropZone.appendChild(cardContainer);
    }
    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Выбирай с умом... или хватай любую.";
}

// Полет выбранной карты в центр экрана
async function handleCardClick(clickedCard) {
    if (isDrawing.value) return; 
    isDrawing.value = true;

    haptic('impactOccurred', 'medium');
    
    const allCards = DOM.cardsDropZone.querySelectorAll('.card-container');
    allCards.forEach(card => {
        if (card !== clickedCard) {
            card.classList.remove('card-enter-left');
            card.classList.add('card-leave-right');
            card.addEventListener('animationend', () => card.remove());
        }
    });
    
    document.body.appendChild(clickedCard);
    
    const sceneOverlay = document.querySelector('.scene-dark-overlay');
    if (sceneOverlay) sceneOverlay.classList.add('active');

    clickedCard.classList.remove('closed-choice-card', 'card-enter-left');
    clickedCard.classList.add('card-zoom-and-fly');

    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Смахни карту или просто нажми на неё, чтобы раскрыть...";

    try {
        const response = await apiFetch('/api/draw-card', { method: 'POST' });
        const result = await response.json();

        if (result.status === "success") {
            let rarityClass = 'common';
            if (result.card.rarity) {
                const r = result.card.rarity.toLowerCase();
                if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
                if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
            }
            const isLegendary = rarityClass === 'legendary';
            const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';

            const innerEl = clickedCard.querySelector('.card-inner');
            if (innerEl) {
                innerEl.innerHTML += `
                    <div class="card-back rarity-${rarityClass}">
                        <img class="card-image-bg" src="${result.card.image_url}">
                        <div class="card-frame-border"></div>
                        <div class="card-id-badge">${result.card.id || '?'}</div>
                        <div class="card-text-plate">
                            <div class="card-title-text">${result.card.title}</div>
                            <div class="card-rarity-text">${result.card.rarity ? result.card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                        </div>
                        ${glareHtml}
                    </div>`;
            }

            setTimeout(() => {
                initSwipeMechanic(clickedCard, result.card);
                askNotifyPermissionOnce();
            }, 650);
            
            playerProfile.last_pack_opened = result.last_pack_opened || new Date().toISOString();

        } else {
            if (DOM.speechBubbleEl) {
                DOM.speechBubbleEl.textContent = `Ой-ой... ${result.detail || "Призыв сорвался!"}`;
            }
            clickedCard.remove();
            document.querySelector('.scene-dark-overlay')?.classList.remove('active');
            isDrawing.value = false; 
            renderThreeClosedCards();
        }
    } catch (e) {
        if (DOM.speechBubbleEl) {
            DOM.speechBubbleEl.textContent = "Хм... В АДу не ловит. Проблемы со связью!";
        }
        clickedCard.remove();
        document.querySelector('.scene-dark-overlay')?.classList.remove('active');
        isDrawing.value = false;
        renderThreeClosedCards();
    }
}
