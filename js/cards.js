import { DOM, playerProfile, isDrawing, apiFetch, haptic } from './config.js';

// Проверка кулдауна
export function checkCooldownStatus() {
    if (!playerProfile) return;
    
    // Блокируем проверку и спавн, если карта В ПРОЦЕССЕ выбора, раскрытия или свайпа
    if (isDrawing.value === true) return; 

    // Вычисляем реальную разницу во времени перед тем, как смотреть на текстовый статус HUD
    const last = playerProfile.last_pack_opened;
    const diff = last ? new Date(last).getTime() + 4 * 3600000 - Date.now() : 0;

    // Если 4 часа еще не прошли, выходим из функции! Никаких карт на столе!
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
function renderThreeClosedCards() {
    // Гарантируем сброс флага, так как карты только появились на столе и ждут клика
    isDrawing.value = false; 
    
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

            // Генерируем лицо карты СРАЗУ, чтобы его было видно сбоку при 3D-повороте
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
// МЕХАНИКА ИНТЕРАКТИВНОГО 3D-СВАЙПА
// МЕХАНИКА ИНТЕРАКТИВНОГО 3D-СВАЙПА С ПОДДЕРЖКОЙ КЛИКА
function initSwipeMechanic(cardEl, cardData) {
    let startX = 0, startY = 0; // ИСПРАВЛЕНИЕ: запоминаем Y координату тоже для проверки тапа
    let currentX = 0, currentY = 0;
    let dragging = false;
    
    const activationThreshold = window.innerWidth * 0.25; 
    const resistanceCoef = 0.75; 
    let lastHapticTick = 0;

    const innerEl = cardEl.querySelector('.card-inner');

    cardEl.classList.add('settled');
    cardEl.style.filter = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
    cardEl.style.touchAction = 'none';

    cardEl.addEventListener('pointerdown', (e) => {
        if (cardEl.classList.contains('flipped')) return;
        if (e.cancelable) e.preventDefault();
        
        dragging = true;
        startX = e.clientX;
        startY = e.clientY; // ИСПРАВЛЕНИЕ
        currentX = 0;
        currentY = 0;
        lastHapticTick = 0;
        
        cardEl.setPointerCapture(e.pointerId);
        if (innerEl) innerEl.style.transition = 'none';
        cardEl.style.transition = 'none';
        
        cardEl.style.transform = 'translate(-50%, -50%) scale(1.03)';
        haptic('impactOccurred', 'light');
    });

    cardEl.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        
        currentX = e.clientX - startX;
        currentY = e.clientY - startY; // ИСПРАВЛЕНИЕ: трекаем движение по вертикали тоже
        
        const dragDistance = currentX * resistanceCoef;
        let rotateY = (dragDistance / activationThreshold) * 75;
        rotateY = Math.max(-140, Math.min(140, rotateY)); 

        cardEl.style.transform = `translate(calc(-50% + ${dragDistance}px), -50%) scale(1.03)`;

        if (innerEl) {
            innerEl.style.transform = `rotateY(${rotateY}deg) rotateZ(${(dragDistance / activationThreshold) * 4}deg)`;
        }

        const currentTick = Math.floor(Math.abs(rotateY) / 15);
        if (currentTick !== lastHapticTick) {
            haptic('impactOccurred', 'soft');
            lastHapticTick = currentTick;
        }
    });

    const end = (e) => {
        if (!dragging) return;
        dragging = false;
        
        cardEl.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        if (innerEl) innerEl.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        
        // ИСПРАВЛЕНИЕ: Проверяем, был ли это просто тап (сдвиг пальца меньше 6 пикселей)
        const moveDistance = Math.sqrt(currentX * currentX + currentY * currentY);
        if (moveDistance < 6) {
            // Если игрок просто кликнул — раскрываем карту в случайную сторону (180 или -180 градусов)
            const randomDirection = Math.random() > 0.5 ? 180 : -180;
            flipAndRevealCard(cardEl, cardData, randomDirection);
            return;
        }

        // Логика свайпа, если палец сдвинулся далеко
        if (Math.abs(currentX) >= activationThreshold) {
            const finalDirection = currentX > 0 ? 180 : -180;
            flipAndRevealCard(cardEl, cardData, finalDirection);
        } else {
            cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
            if (innerEl) innerEl.style.transform = 'none';
            haptic('notificationOccurred', 'warning');
        }
    };

    cardEl.addEventListener('pointerup', end);
    cardEl.addEventListener('pointercancel', end);
}


// Финальное раскрытие
function flipAndRevealCard(cardEl, cardData, finalAngle) {
    if (cardEl.classList.contains('flipped')) return;

    const innerEl = cardEl.querySelector('.card-inner');
    cardEl.style.transform = 'translate(-50%, -50%)';

    if (innerEl) {
        innerEl.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        innerEl.style.transform = `rotateY(${finalAngle}deg)`;
    }
    
    cardEl.classList.add('flipped');
    haptic('notificationOccurred', 'success');

    setTimeout(() => {
        renderInPlaceActionButtons(cardData, cardEl);
    }, 500);
}

// Создание кнопок "В колоду" и "Сжечь" прямо под картой
function renderInPlaceActionButtons(cardData, cardEl) {
    if (document.querySelector('.inline-action-buttons')) return;

    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Решай судьбу этой карты...";

    const btnWrapper = document.createElement('div');
    btnWrapper.className = 'inline-action-buttons';
    btnWrapper.innerHTML = `
        <button class="btn-inline-keep">В колоду</button>
        <button class="btn-inline-burn">🔥 Сжечь (+${cardData.point_value || 10} 🪙)</button>
    `;
    
    document.body.appendChild(btnWrapper); 
    setTimeout(() => btnWrapper.classList.add('visible'), 50);

    // Логика кнопки "В колоду"
    btnWrapper.querySelector('.btn-inline-keep').onclick = () => {
        btnWrapper.classList.remove('visible');
        cardEl.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
        cardEl.style.transform = 'translateY(150px) scale(0) rotate(15deg)';
        cardEl.style.opacity = '0';

        setTimeout(() => {
            btnWrapper.remove();
            cardEl.remove(); 
            DOM.cardsDropZone.innerHTML = '';
            const sceneOverlay = document.querySelector('.scene-dark-overlay');
            if (sceneOverlay) sceneOverlay.classList.remove('active');
            
            // Жестко блокируем спавн карт
            isDrawing.value = false;
            checkCooldownStatus();
        }, 500);
    };

    // Логика кнопки "Сжечь" на столе
        // Логика кнопки "Сжечь" на столе
    btnWrapper.querySelector('.btn-inline-burn').onclick = async () => {
        btnWrapper.classList.remove('visible');
        
        const configModule = await import('./config.js');
        configModule.showLoader(); 
        
        try {
            // Жёстко держим флаг блокировки, чтобы ежесекундный таймер не спавнил новые карты в фоне
            isDrawing.value = true;

            const response = await apiFetch(`/api/burn-card/${cardData.id}`, { method: 'POST' });
            if (!response.ok) throw new Error('burn failed');
            const resData = await response.json();
            
            playerProfile.points = resData.new_points;
            if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
            
            if (DOM.speechBubbleEl && resData.bot_phrase) {
                DOM.speechBubbleEl.textContent = resData.bot_phrase;
            }

            if (resData.last_pack_opened) {
                playerProfile.last_pack_opened = resData.last_pack_opened;
            }

            cardEl.classList.add('card-burn-animation');
            
            setTimeout(() => {
                btnWrapper.remove();
                cardEl.remove();
                DOM.cardsDropZone.innerHTML = '';
                
                const sceneOverlay = document.querySelector('.scene-dark-overlay');
                if (sceneOverlay) sceneOverlay.classList.remove('active');
                
                configModule.hideLoader(); 
                
                // ИСПРАВЛЕНИЕ: Снимаем блокировку рисования ТОЛЬКО после того, как карта физически исчезла
                isDrawing.value = false;
                
                // Проверяем статус. Теперь, так как дата обновилась, новые карты не вылезут раньше времени
                checkCooldownStatus();
            }, 800);

        } catch (e) {
            console.error("Ошибка при сжигании карты:", e);
            if (DOM.speechBubbleEl) {
                DOM.speechBubbleEl.textContent = "Огонь не разгорелся... Попробуй ещё раз.";
            }
            btnWrapper.classList.add('visible');
            configModule.hideLoader(); 
            // В случае ошибки возвращаем управление игроку
            isDrawing.value = false;
        }
    };

}

// Окно детального просмотра (из коллекции)
export function openModal(card) {
    const realCardModal = document.querySelector('.card-modal') || document.getElementById('card-modal');
    if (!realCardModal) return;

    const modalPlaceholder = realCardModal.querySelector('.modal-card-placeholder');
    if (modalPlaceholder) {
        let rarityClass = 'common';
        if (card.rarity) {
            const r = card.rarity.toLowerCase();
            if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
            if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
        }
        const isLegendary = rarityClass === 'legendary';
        const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';

        modalPlaceholder.innerHTML = `
            <div class="card-container modal-view">
                <div class="card-inner" style="transform: none !important;">
                    <div class="card-back rarity-${rarityClass}" style="transform: none !important; position: relative !important;">
                        <img class="card-image-bg" src="${card.image_url}">
                        <div class="card-frame-border"></div>
                        <div class="card-id-badge">${card.id || '?'}</div>
                        <div class="card-text-plate">
                            <div class="card-title-text">${card.title}</div>
                            <div class="card-rarity-text">${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
                        </div>
                        ${glareHtml}
                    </div>
                </div>
            </div>`;
    }
    
    realCardModal.style.setProperty('display', 'flex', 'important');
    realCardModal.style.setProperty('z-index', '999999', 'important');
    requestAnimationFrame(() => realCardModal.style.opacity = '1');

    setTimeout(() => {
        const tiltCard = realCardModal.querySelector('.modal-view');
        if (!tiltCard) return;

        let ticking = false;
        const updateTilt = (clientX, clientY) => {
            const rect = tiltCard.getBoundingClientRect();
            const x = clientX - rect.left - rect.width / 2;
            const y = clientY - rect.top - rect.height / 2;
            let rotateX = (-y / (rect.height / 2)) * 12;
            let rotateY = (x / (rect.width / 2)) * 12;
            rotateX = Math.max(-12, Math.min(12, rotateX));
            rotateY = Math.max(-12, Math.min(12, rotateY));
            tiltCard.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
            ticking = false;
        };

        const handleMove = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            if (!ticking) {
                requestAnimationFrame(() => updateTilt(clientX, clientY));
                ticking = true;
            }
        };

        const resetTilt = () => {
            tiltCard.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)`;
        };

        tiltCard.addEventListener('mousemove', handleMove);
        tiltCard.addEventListener('mouseleave', resetTilt);
        tiltCard.addEventListener('touchmove', handleMove, { passive: true });
        tiltCard.addEventListener('touchend', resetTilt);
    }, 150);

    const keepBtn = realCardModal.querySelector('.btn-keep');
    if (keepBtn) {
        keepBtn.onclick = () => {
            realCardModal.style.opacity = '0';
            setTimeout(() => { realCardModal.style.display = 'none'; }, 400);
        };
    }}