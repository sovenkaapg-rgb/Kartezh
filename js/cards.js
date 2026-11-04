 import { DOM, playerProfile, isDrawing, apiFetch, haptic } from './config.js';

// Проверка кулдауна
export function checkCooldownStatus() {
    if (!playerProfile) return;
    
    // Если игрок УЖЕ в процессе выбора/анимации/свайпа, блокируем повторный спавн карт!
    if (isDrawing.value === true) return; 

    if (DOM.timeLeftEl.textContent === "Готово!" || DOM.timeLeftEl.textContent === "00ч 00м 00с") {
        // Проверяем, что на столе действительно пусто и анимация не запущена
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

    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Смахни карту влево или вправо, чтобы раскрыть её...";

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

            playerProfile.points = result.points_updated || playerProfile.points;
            if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
            playerProfile.last_pack_opened = new Date().toISOString(); 

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
function initSwipeMechanic(cardEl, cardData) {
    let startX = 0, currentX = 0, dragging = false;
    const activationThreshold = window.innerWidth * 0.35; 
    const resistanceCoef = 0.55; 
    let lastHapticTick = 0;

    const innerEl = cardEl.querySelector('.card-inner');

    cardEl.classList.add('settled');
    cardEl.style.filter = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
    cardEl.style.touchAction = 'none';

    cardEl.addEventListener('pointerdown', (e) => {
        if (cardEl.classList.contains('flipped')) return;
        dragging = true;
        startX = e.clientX;
        currentX = 0;
        lastHapticTick = 0;
        cardEl.setPointerCapture(e.pointerId);
        if (innerEl) innerEl.style.transition = 'none';
        cardEl.style.transition = 'none';
        
        haptic('impactOccurred', 'light');
    });

    cardEl.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        
        currentX = e.clientX - startX;
        const dragDistance = currentX * resistanceCoef;
        
        // 1. Вращаем карту по оси Y от -140 до 140 градусов
        let rotateY = (dragDistance / activationThreshold) * 90;
        rotateY = Math.max(-140, Math.min(140, rotateY)); 

        // 2. Двигаем РОДИТЕЛЬСКИЙ контейнер по экрану (сохраняя центрирование -50%)
        cardEl.style.transform = `translate(calc(-50% + ${dragDistance}px), -50%)`;

        // 3. Внутренний каркас ТОЛЬКО крутится вокруг своей оси, никуда не уезжая
        if (innerEl) {
            innerEl.style.transform = `rotateY(${rotateY}deg) rotateZ(${(dragDistance / activationThreshold) * 3}deg)`;
        }

        const currentTick = Math.floor(Math.abs(rotateY) / 20);
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
        
        if (Math.abs(currentX) >= activationThreshold) {
            const finalDirection = currentX > 0 ? 180 : -180;
            flipAndRevealCard(cardEl, cardData, finalDirection);
        } else {
            // Возвращаем в строгий центр экрана
            cardEl.style.transform = 'translate(-50%, -50%)';
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

    // Карта остается центрированной на родителе
    cardEl.style.transform = 'translate(-50%, -50%)';

    if (innerEl) {
        innerEl.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        innerEl.style.transform = `rotateY(${finalAngle}deg)`; // Только чистый разворот
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
            cardEl.remove(); // <--- ФИКС: Физически удаляем карту из document.body
            DOM.cardsDropZone.innerHTML = '';
            const sceneOverlay = document.querySelector('.scene-dark-overlay');
            if (sceneOverlay) sceneOverlay.classList.remove('active');
            isDrawing.value = false;
        }, 500);
    };

    // Логика кнопки "Сжечь"
btnWrapper.querySelector('.btn-inline-burn').onclick = async () => {
    btnWrapper.classList.remove('visible');
    try {
        const response = await apiFetch(`/api/burn-card/${cardData.id}`, { method: 'POST' });
        if (!response.ok) throw new Error('burn failed');
        const resData = await response.json();
        playerProfile.points = resData.new_points;
        if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
    } catch (e) {
        if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Огонь не разгорелся... Попробуй ещё раз.";
        btnWrapper.classList.add('visible');
        return;
    }
    cardEl.classList.add('card-burn-animation');
    setTimeout(() => {
        btnWrapper.remove();
        cardEl.remove();
        DOM.cardsDropZone.innerHTML = '';
        document.querySelector('.scene-dark-overlay')?.classList.remove('active');
        isDrawing.value = false;
    }, 800);
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

        // Наполнение плейсхолдера: убран класс flipped и инлайновые rotateY
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
    setTimeout(() => realCardModal.style.opacity = '1', 10);

    // Интерактивный 3D-наклон большой карты за курсором/пальцем
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

    // Обработчик кнопки "Оставить" (просто закрывает модалку)
    const keepBtn = realCardModal.querySelector('.btn-keep');
    if (keepBtn) {
        keepBtn.onclick = () => {
            realCardModal.style.opacity = '0';
            setTimeout(() => { realCardModal.style.display = 'none'; }, 400);
        };
    }

    // Обработчик кнопки "Сжечь" из коллекции
    const burnBtn = realCardModal.querySelector('.btn-burn');
    // Обработчик кнопки "Сжечь" из коллекции (Внутри функции openModal в cards.js)
    if (burnBtn) {
        burnBtn.textContent = `🔥 Сжечь (+${card.point_value || 10} 🪙)`;
        burnBtn.onclick = async () => {
            const modalViewCard = realCardModal.querySelector('.modal-card-placeholder .card-container');
            if (modalViewCard) modalViewCard.classList.add('card-burn-animation');

            setTimeout(() => {
                realCardModal.style.opacity = '0';
                setTimeout(() => { realCardModal.style.display = 'none'; }, 200);
            }, 300); 

            try {
                const configModule = await import('./config.js');
                const response = await configModule.apiFetch(`/api/burn-card/${card.id}`, { method: 'POST' });
                
                if (response.ok) {
                    const resData = await response.json();
                    configModule.playerProfile.points = resData.new_points;
                    if (configModule.DOM.coinBalanceEl) configModule.DOM.coinBalanceEl.textContent = resData.new_points;

                    const { renderDeckGrid } = await import('./deck.js');
                    await renderDeckGrid();
                } else {
                    const err = await response.json();
                    // Ошибку сжигания отправляем в бабл бота вместо alert
                    if (configModule.DOM.speechBubbleEl) {
                        configModule.DOM.speechBubbleEl.textContent = `черт не горит ${err.detail || ""}`;
                    }
                }
                } catch (e) {
                console.error("Ошибка сжигания из коллекции:", e);
                const configModule = await import('./config.js');
                if (configModule.DOM.speechBubbleEl) {
                    configModule.DOM.speechBubbleEl.textContent = "Не могу связаться с сервером, огонь затухает...";
                }
            }
        };
    }
}
