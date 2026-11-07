import { DOM, tg, playerProfile, isDrawing, apiFetch, haptic, toast } from './config.js';
import { checkCooldownStatus, renderThreeClosedCards } from './cards.js';

// МЕХАНИКА ИНТЕРАКТИВНОГО 3D-СВАЙПА С ПОДДЕРЖКОЙ КЛИКА
export function initSwipeMechanic(cardEl, cardData) {
    let startX = 0, startY = 0; 
    let currentX = 0, currentY = 0;
    let dragging = false;
    
    // Зона свайпа теперь привязана к ширине КАРТЫ, а не экрана (карта ~220px)
    // 120px — это чуть больше половины карты, очень легко смахнуть
    const activationThreshold = 120; 
    const resistanceCoef = 1.0; // Убрали сопротивление, карта двигается 1 в 1 с пальцем
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
        startY = e.clientY; 
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
        currentY = e.clientY - startY; 
        
        // Вращение карты (максимум 180 градусов)
        let rotateY = (currentX / activationThreshold) * 90;
        rotateY = Math.max(-180, Math.min(180, rotateY)); 

        cardEl.style.transform = `translate(calc(-50% + ${currentX * 0.5}px), -50%) scale(1.03)`;

        if (innerEl) {
            innerEl.style.transform = `rotateY(${rotateY}deg) rotateZ(${(currentX / activationThreshold) * 4}deg)`;
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
        
        const moveDistance = Math.sqrt(currentX * currentX + currentY * currentY);
        
        // Если сдвинули меньше 15px — это просто клик, переворачиваем карту
        if (moveDistance < 15) {
            const randomDirection = Math.random() > 0.5 ? 180 : -180;
            flipAndRevealCard(cardEl, cardData, randomDirection);
            return;
        }

        // Если сдвинули больше 60% от нужного расстояния — засчитываем свайп
        if (Math.abs(currentX) >= activationThreshold * 0.6) {
            const finalDirection = currentX > 0 ? 180 : -180;
            flipAndRevealCard(cardEl, cardData, finalDirection);
        } else {
            // Иначе возвращаем на место
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
export function renderInPlaceActionButtons(cardData, cardEl) {
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

    btnWrapper.querySelector('.btn-inline-keep').onclick = async () => {
        btnWrapper.classList.remove('visible');
        await apiFetch('/api/confirm-card', { method: 'POST' });
        
        cardEl.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
        cardEl.style.transform = 'translateY(150px) scale(0) rotate(15deg)';
        cardEl.style.opacity = '0';

        setTimeout(() => {
            btnWrapper.remove();
            cardEl.remove(); 
            DOM.cardsDropZone.innerHTML = '';
            const sceneOverlay = document.querySelector('.scene-dark-overlay');
            if (sceneOverlay) sceneOverlay.classList.remove('active');
            
            isDrawing.value = false;
            checkCooldownStatus();
        }, 500);
    };

    btnWrapper.querySelector('.btn-inline-burn').onclick = async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        btnWrapper.classList.remove('visible');
        const configModule = await import('./config.js');
        configModule.showLoader(); 
        
        try {
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
                isDrawing.value = false;
                checkCooldownStatus();
            }, 800);

        } catch (e) {
            console.error("Ошибка при сжигании карты:", e);
            if (DOM.speechBubbleEl) {
                DOM.speechBubbleEl.textContent = "Огонь не разгорелся... Попробуй ещё раз.";
            }
            btnWrapper.classList.add('visible');
            configModule.hideLoader(); 
            isDrawing.value = false;
        }
    };
}

function askConfirm(message) {
    return new Promise((resolve) => {
        if (tg?.initData && tg.isVersionAtLeast?.('6.2') && tg.showConfirm) tg.showConfirm(message, resolve);
        else resolve(window.confirm(message));
    });
}

// Окно детального просмотра (из коллекции)
export function openModal(card) {
    const realCardModal = document.querySelector('.card-modal') || document.getElementById('card-modal');
    if (!realCardModal) return;

    const modalPlaceholder = realCardModal.querySelector('.modal-card-placeholder');
    if (modalPlaceholder) {
        let rarityClass = 'common';
        const r = (card.rarity || '').toLowerCase();
        if (r === 'редкая' || r === 'редк') rarityClass = 'rare';
        if (r === 'лега' || r === 'легендарная') rarityClass = 'legendary';
        
        const glareHtml = rarityClass === 'legendary' ? '<div class="legendary-glare"></div>' : '';

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

    // Логика кнопки закрытия модального окна предпросмотра
    const keepBtn = realCardModal.querySelector('.btn-keep');
    if (keepBtn) {
        keepBtn.onclick = () => {
            realCardModal.style.opacity = '0';
            setTimeout(() => { realCardModal.style.display = 'none'; }, 400);
        };
    }

    // Логика кнопки сжигания дубликатов из коллекции
    const burnBtn = realCardModal.querySelector('.btn-burn');
    if (burnBtn) {
        const pts = card.point_value || 10;
        burnBtn.disabled = false;
        burnBtn.textContent = `🔥 Сжечь (+${pts} 🪙)`;

        burnBtn.onclick = async () => {
            if (burnBtn.disabled) return;

            const qty = card.quantity || 1;
            // Если карта единственная или редкая/лега — запрашиваем строгое подтверждение
            const risky = qty <= 1 || /^(ред|лега)/i.test(card.rarity || '');
            if (risky) {
                const ok = await askConfirm(
                    qty <= 1 ? `Это твоя единственная «${card.title}». Сжечь?` : `Сжечь копию «${card.title}»?`
                );
                if (!ok) return;
            }

            burnBtn.disabled = true;
            try {
                // Атомарный запрос на сжигание
                const response = await apiFetch(`/api/burn-card/${card.id}`, { method: 'POST' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    toast(data.detail || 'Огонь не разгорелся...');
                    burnBtn.disabled = false;
                    return;
                }

                playerProfile.points = data.new_points;
                if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = data.new_points;

                // Запуск CSS-анимации превращения в пепел
                realCardModal.querySelector('.modal-card-placeholder .card-container')
                    ?.classList.add('card-burn-animation');

                // Точечно правим кэш и плитку в UI колоды без перезагрузки
                const { applyBurn } = await import('./deck.js');
                applyBurn(card.id);   
                if (data.bot_phrase) toast(data.bot_phrase);

                setTimeout(() => {
                    realCardModal.style.opacity = '0';
                    setTimeout(() => { realCardModal.style.display = 'none'; }, 250);
                }, 800);
            } catch (e) {
                toast('Нет связи с сервером, огонь затухает...');
                burnBtn.disabled = false;
            }
        };
    }
}