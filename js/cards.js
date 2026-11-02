import { API_URL, DOM, tg, playerProfile, isDrawing } from './config.js';
import { loginAndInitGame } from './main.js';

export function checkCooldownStatus() {
    if (!playerProfile) return;
    if (DOM.timeLeftEl.textContent === "Готово!" || DOM.timeLeftEl.textContent === "00ч 00м 00с") {
        if (DOM.cardsDropZone.querySelector('.zone-placeholder') || (!DOM.cardsDropZone.querySelector('.card-container') && !isDrawing.value)) {
            renderThreeClosedCards();
        }
    }
}

function renderThreeClosedCards() {
    DOM.cardsDropZone.innerHTML = '';
    isDrawing.value = false;

    for (let i = 1; i <= 3; i++) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container closed-choice-card';
        cardContainer.innerHTML = `<div class="card-inner"><div class="card-front"></div></div>`;
        cardContainer.addEventListener('click', () => handleCardClick(cardContainer));
        DOM.cardsDropZone.appendChild(cardContainer);
    }
    if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Выбирай с умом... или хватай любую.";
}

async function handleCardClick(clickedCard) {
    if (isDrawing.value) return; 
    isDrawing.value = true;

    // Легкий щелчок при касании рубашки
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); 

    try {
        const response = await fetch(`${API_URL}/draw-card/${playerProfile.username}`, { method: 'POST' });
        const result = await response.json();

        if (result.status === "success") {
            const allCards = DOM.cardsDropZone.querySelectorAll('.card-container');
            
            // 1. Лишние карты мгновенно исчезают
            allCards.forEach(card => {
                if (card !== clickedCard) {
                    card.classList.add('card-fade-out-fast');
                    card.addEventListener('animationend', () => card.remove());
                }
            });

            // 2. Включаем эпичный полет РУБАШКОЙ ВВЕРХ
            clickedCard.classList.remove('closed-choice-card');
            clickedCard.classList.add('card-zoom-and-fly');

            if (DOM.speechBubbleEl) DOM.speechBubbleEl.textContent = "Хм-м... Давай посмотрим, что тебе уготовила судьба!";

            // 3. Ждем 750мс (пока карта полностью долетит и затормозит в воздухе)
            setTimeout(() => {
                const isLegendary = result.card.rarity && result.card.rarity.toLowerCase() === 'лега';
                const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';

                // Подгружаем лицо под рубашку
                clickedCard.querySelector('.card-inner').innerHTML += `
                    <div class="card-back">
                        <img class="card-image-bg" src="${result.card.image_url}">
                        ${glareHtml}
                        <div class="card-content">
                            <div class="card-title">${result.card.title}</div>
                            <div class="card-rarity" style="${isLegendary ? 'color: #ffd700; text-shadow: 0 0 10px gold;' : ''}">
                                ${result.card.rarity ? result.card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}
                            </div>
                        </div>
                    </div>`;

                // 4. Сочный переворот с вибрацией "УДАРА"
                clickedCard.classList.add('flipped');
                if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); // Двойной победный виброотклик

                // 5. Даем игроку 1.5 секунды рассмотреть карту во весь экран, и только потом мягко открываем 3D модалку с кнопками
                setTimeout(() => {
                    openModal(result.card);
                }, 1500);

            }, 750);

            // Обновляем баланс монет на заднем плане
            await loginAndInitGame();

        } else {
            alert(result.detail || "Ошибка призыва!");
            isDrawing.value = false;
        }
    } catch (e) {
        alert("Станция не отвечает!");
        isDrawing.value = false;
    }
}


export function openModal(card) {
    const realCardModal = document.querySelector('.card-modal') || document.getElementById('card-modal');
    if (!realCardModal) return;
    
    const isLegendary = card.rarity && card.rarity.toLowerCase() === 'лега';
    const glareHtml = isLegendary ? '<div class="legendary-glare"></div>' : '';

    const modalPlaceholder = realCardModal.querySelector('.modal-card-placeholder');
    if (modalPlaceholder) {
        modalPlaceholder.innerHTML = `
            <div class="card-container flipped modal-view" style="transform-style: preserve-3d; transition: transform 0.1s ease-out;">
                <div class="card-inner" style="width: 100%; height: 100%; transform-style: preserve-3d; pointer-events: none;">
                    <div class="card-back" style="width: 100%; height: 100%; position: absolute; backface-visibility: hidden; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.9); border: 2px solid ${isLegendary ? '#ffd700' : 'rgba(255,255,255,0.15)'}; display: flex; flex-direction: column; justify-content: center; align-items: center; overflow: hidden;">
                        <img class="card-image-bg" src="${card.image_url}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:1;">
                        ${glareHtml}
                        <div class="card-content" style="z-index:2; width:100%; height:100%; display:flex; flex-direction:column; justify-content:flex-end; padding:15px; background: linear-gradient(to top, rgba(12,7,20,1) 20%, rgba(12,7,20,0) 100%);">
                            <div class="card-title" style="font-size: 1rem; font-weight: bold; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.9); margin-bottom:5px;">${card.title}</div>
                            <div class="card-rarity" style="font-size: 0.75rem; font-weight: 800; letter-spacing: 2px; ${isLegendary ? 'color: #ffd700; text-shadow: 0 0 10px gold;' : 'color:#bbb;'}">
                                ${card.rarity ? card.rarity.toUpperCase() : 'ОБЫЧНАЯ'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    // Включаем показ модалки СРАЗУ
    realCardModal.style.setProperty('display', 'flex', 'important');
    realCardModal.style.setProperty('z-index', '9999', 'important');
    setTimeout(() => realCardModal.style.opacity = '1', 10);

    // Активируем 3D-покачивание с задержкой, когда карта точно появилась на экране
    setTimeout(() => {
        const tiltCard = realCardModal.querySelector('.modal-view');
        if (!tiltCard) return;

        let ticking = false;

        const updateTilt = (clientX, clientY) => {
            const rect = tiltCard.getBoundingClientRect();
            const x = clientX - rect.left - rect.width / 2;
            const y = clientY - rect.top - rect.height / 2;
            
            // 1. Считаем наклон, уменьшив базовую чувствительность (делим на 2)
            let rotateX = (-y / (rect.height / 2)) * 12;
            let rotateY = (x / (rect.width / 2)) * 12;
            
            // 2. ЖЕСТКОЕ ОГРАНИЧЕНИЕ (CLAMP): карта физически не сможет наклониться больше чем на 12 градусов в любую сторону!
            rotateX = Math.max(-12, Math.min(12, rotateX));
            rotateY = Math.max(-12, Math.min(12, rotateY));
            
            // 3. Применяем трансформацию. Больше никаких переворотов изнанкой наружу!
            tiltCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
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
            // Мягко возвращаем карту в идеально ровное положение
            tiltCard.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`;
        };


        // Слушатели для ПК-мышки
        tiltCard.addEventListener('mousemove', handleMove);
        tiltCard.addEventListener('mouseleave', resetTilt);
        
        // Слушатели для Telegram (палец на телефоне)
        tiltCard.addEventListener('touchmove', handleMove, { passive: true });
        tiltCard.addEventListener('touchend', resetTilt);
    }, 150);

    // Кнопки Назад и Сжечь
    const keepBtn = realCardModal.querySelector('.btn-keep');
    if (keepBtn) {
        keepBtn.onclick = () => {
            realCardModal.style.opacity = '0';
            setTimeout(() => realCardModal.style.display = 'none', 400);
        };
    }

    const burnBtn = realCardModal.querySelector('.btn-burn');
    if (burnBtn) {
        burnBtn.textContent = `🔥 Сжечь (+${card.point_value || 10} 🪙)`;
        burnBtn.onclick = async () => {
            
            // 1. Находим большую карту в модалке и карту на столе, поджигаем ИХ ОБЕИХ в зуме
            const modalViewCard = realCardModal.querySelector('.modal-card-placeholder .card-container');
            if (modalViewCard) modalViewCard.classList.add('card-burn-animation');
            
            const currentCard = DOM.cardsDropZone.querySelector('.card-container');
            if (currentCard) currentCard.classList.add('card-burn-animation');

            // 2. МГНОВЕННО прячем только блок с кнопками "Назад" и "Сжечь", чтобы они не висели
            const modalActions = realCardModal.querySelector('.modal-actions');
            if (modalActions) {
                modalActions.style.transition = 'opacity 0.15s ease';
                modalActions.style.opacity = '0';
            }
            
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            
            // 3. Быстро отправляем запрос на бэкенд Python
            try {
                const response = await fetch(`${API_URL}/burn-card/${playerProfile.username}/${card.id}`, { 
                    method: 'POST' 
                });
                
                if (response.ok) { 
                    // Обновляем монеты на верхнем баре
                    await loginAndInitGame(); 
                    
                    // Если мы в колоде — перерисовываем сетку карт под закрывающейся модалкой
                    const deckScreen = document.querySelector('.deck-screen');
                    if (deckScreen && deckScreen.style.display === 'flex') {
                        const { renderDeckGrid } = await import('./deck.js');
                        await renderDeckGrid();
                    }
                }
            } catch (e) { 
                console.error("Ошибка при сжигании карты:", e); 
            }
            
            // 4. Закрываем само темное окно ровно тогда, когда карта в зуме превратится в пепел (600мс)
            setTimeout(() => {
                realCardModal.style.transition = 'opacity 0.2s ease';
                realCardModal.style.opacity = '0';
                
                setTimeout(() => {
                    realCardModal.style.display = 'none';
                    // Возвращаем видимость кнопкам для следующего открытия
                    if (modalActions) modalActions.style.opacity = '1'; 
                    
                    // Очищаем стол призыва
                    DOM.cardsDropZone.innerHTML = '<div class="zone-placeholder">Нажми на круг...</div>';
                    isDrawing.value = false;
                }, 200);
            }, 600); // 600мс карта горит в зуме, на 800мс окно полностью удаляется
        };
    }


}


export function closeModal() {
    DOM.cardModal.style.opacity = '0';
    setTimeout(() => DOM.cardModal.style.display = 'none', 400);
}
