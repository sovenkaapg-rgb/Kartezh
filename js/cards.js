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
    isDrawing.value = true; // Переводим в режим анимации/выбора

    haptic('impactOccurred', 'medium');
    // Убираем оставшиеся две карты со стола направо
    const allCards = DOM.cardsDropZone.querySelectorAll('.card-container');
    allCards.forEach(card => {
        if (card !== clickedCard) {
            card.classList.remove('card-enter-left');
            card.classList.add('card-leave-right');
            card.addEventListener('animationend', () => card.remove());
        }
    });
    
    document.body.appendChild(clickedCard);
    // Включаем полноэкранное затемнение сцены
    const sceneOverlay = document.querySelector('.scene-dark-overlay');
    if (sceneOverlay) sceneOverlay.classList.add('active');

    // Очищаем старые классы стола, чтобы включился чистый position: fixed в центре экрана
    clickedCard.classList.remove('closed-choice-card', 'card-enter-left');
    clickedCard.classList.add('card-zoom-and-fly');

    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Смахни карту влево или вправо, чтобы раскрыть её...";

    try {
        const response = await apiFetch('/api/draw-card', { method: 'POST' });
        const result = await response.json();

             if (result.status === "success") {
            setTimeout(() => {
                initSwipeMechanic(clickedCard, result.card);
            }, 650);

            playerProfile.points = result.points_updated || playerProfile.points;
            if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = playerProfile.points;
            playerProfile.last_pack_opened = new Date().toISOString(); 

        } else {
            // ВМЕСТО ALERT: Бот сообщает об ошибке призыва
            if (DOM.speechBubbleEl) {
                DOM.speechBubbleEl.textContent = `Ой-ой... ${result.detail || "Призыв сорвался! Давай попробуем еще раз?"}`;
            }
            clickedCard.remove();
            document.querySelector('.scene-dark-overlay')?.classList.remove('active');
            isDrawing.value = false; 
            renderThreeClosedCards();
            
        }
    } catch (e) {
        // ВМЕСТО ALERT: Бот ворчит на упавший сервер
        if (DOM.speechBubbleEl) {
            DOM.speechBubbleEl.textContent = "Хм... В АДу не ловит. Похоже, у нас проблемы со связью!";
        }
        clickedCard.remove();
        document.querySelector('.scene-dark-overlay')?.classList.remove('active');
        isDrawing.value = false;
        renderThreeClosedCards();
    }
}

// МЕХАНИКА ИНТЕРАКТИВНОГО СВАЙПА
function initSwipeMechanic(cardEl, cardData) {
    const threshold = 60;
    let startX = 0, diffX = 0, dragging = false;

    // Снимаем CSS-анимацию вылета, иначе она перебивает inline-transform
    cardEl.classList.add('settled');
    cardEl.style.filter = 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))';
    cardEl.style.touchAction = 'none';

    cardEl.addEventListener('pointerdown', (e) => {
        if (cardEl.classList.contains('flipped')) return;
        dragging = true;
        startX = e.clientX;
        diffX = 0;
        cardEl.setPointerCapture(e.pointerId);
        cardEl.style.transition = 'none';
    });

    cardEl.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        diffX = e.clientX - startX;
        cardEl.style.transform = `translateX(${diffX}px) rotate(${diffX * 0.08}deg)`;
    });

    const end = () => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(diffX) >= threshold) {
            flipAndRevealCard(cardEl, cardData);
        } else {
            cardEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
            cardEl.style.transform = 'none';
        }
    };
    cardEl.addEventListener('pointerup', end);
    cardEl.addEventListener('pointercancel', end);
}

// Функция 3D-переворота с импульсным эффектом
function flipAndRevealCard(cardEl, cardData) {
    if (cardEl.classList.contains('flipped')) return;

    let rarityClass = 'common';
    if (cardData.rarity) {
        const r = cardData.rarity.toLowerCase();
        if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
        if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
    }
    const isLegendary = rarityClass === 'legendary';
    const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';

    // Генерируем задник (лицо). В CSS .card-back будет изначально развернута на rotateY(180deg)
    cardEl.querySelector('.card-inner').innerHTML += `
        <div class="card-back rarity-${rarityClass}">
            <img class="card-image-bg" src="${cardData.image_url}">
            <div class="card-frame-border"></div>
            <div class="card-id-badge">${cardData.id || '?'}</div>
            <div class="card-text-plate">
                <div class="card-title-text">${cardData.title}</div>
                <div class="card-rarity-text">${cardData.rarity ? cardData.rarity.toUpperCase() : 'ОБЫЧНАЯ'}</div>
            </div>
            ${glareHtml}
        </div>`;

    // Запускаем переворот родительского .card-inner на 180 градусов
    const innerEl = cardEl.querySelector('.card-inner');
    innerEl.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    innerEl.style.transform = 'rotateY(180deg)';

    // Саму обертку фиксируем на месте без сдвигов свайпа
    cardEl.style.transition = 'transform 0.4s ease';
    cardEl.style.transform = 'none';
    cardEl.classList.add('flipped');
    
    haptic('notificationOccurred', 'success');

    // Когда переворот завершился, выкатываем встроенные готические кнопки управления
    setTimeout(() => {
        renderInPlaceActionButtons(cardData, cardEl);
    }, 600);
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
