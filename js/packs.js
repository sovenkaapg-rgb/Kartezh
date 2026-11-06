import { DOM, playerProfile, apiFetch, haptic, toast } from './config.js';
import { invalidateDeck } from './deck.js';

export function initPackSystem() {
    const packScreen = document.getElementById('pack-screen');
    const envelope = document.getElementById('envelope');
    const fanContainer = document.getElementById('pack-cards-fan');
    const collectBtn = document.getElementById('btn-collect-pack');
    const hint = document.getElementById('pack-hint');
    let currentPackCards = [];

    // Переключение вкладок в Колоде
    const tabCollection = document.getElementById('tab-collection');
    const tabShop = document.getElementById('tab-shop');
    const viewCollection = document.getElementById('collection-view');
    const viewShop = document.getElementById('shop-view');

    // Функция проверки монет для кнопок магазина
    function updateShopButtons() {
        const prices = { common: 50, rare: 150, legendary: 500 };
        document.querySelectorAll('.btn-buy-pack').forEach(btn => {
            const packType = btn.dataset.pack;
            const price = prices[packType];
            
            if (playerProfile.points < price) {
                btn.disabled = true;
                btn.textContent = `${price} 🪙 (Мало)`;
            } else {
                btn.disabled = false;
                btn.textContent = `${price} 🪙`;
            }
        });
    }

    if (tabCollection && tabShop) {
        tabCollection.onclick = () => {
            tabCollection.classList.add('active'); tabShop.classList.remove('active');
            viewCollection.style.display = 'block'; viewShop.style.display = 'none';
        };
        tabShop.onclick = () => {
            tabShop.classList.add('active'); tabCollection.classList.remove('active');
            viewShop.style.display = 'block'; viewCollection.style.display = 'none';
            updateShopButtons(); // Обновляем цены при входе в магазин
        };
    }

    // Покупка пака
    document.querySelectorAll('.btn-buy-pack').forEach(btn => {
        btn.onclick = async (e) => {
            const packType = e.target.dataset.pack;
            const res = await apiFetch('/api/buy-pack', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ pack_type: packType })
            });
            const data = await res.json();
            
            if (res.ok) {
                playerProfile.points = data.new_points;
                playerProfile.unopened_packs = data.new_packs;
                if (DOM.coinBalanceEl) DOM.coinBalanceEl.textContent = data.new_points;
                haptic('notificationOccurred', 'success');
                
                // Сразу открываем пак!
                 startPackOpening(packType);
            } else {
                // Показываем ошибку красиво, через тост
                toast(data.detail || "Ошибка покупки");
            }
        };
    });

    // --- МЕХАНИКА ОТКРЫТИЯ ПАКА ---
 async function startPackOpening(packType) { // <-- ДОБАВИЛИ АРГУМЕНТ
        const res = await apiFetch('/api/open-pack', { 
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pack_type: packType }) // <-- ПЕРЕДАЕМ НА СЕРВЕР
        });
        const data = await res.json();
        
        if (!res.ok) return toast(data.detail);
        
        currentPackCards = data.cards;
        playerProfile.unopened_packs = data.remaining_packs;
        
        // Сброс экрана
        packScreen.style.display = 'flex';
        envelope.classList.remove('opened');
        fanContainer.innerHTML = '';
        collectBtn.style.display = 'none';
        hint.style.display = 'block';
        hint.textContent = "Нажми на конверт, чтобы открыть";
        
        // Создаем карты (рубашкой вверх)
        currentPackCards.forEach((card, i) => {
            const el = document.createElement('div');
            el.className = 'fan-card';
            el.innerHTML = `
                <div class="card-inner">
                    <div class="fan-card-front"></div>
                    <div class="fan-card-back">
                        <img src="${card.image_url}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                </div>`;
            // Обработчик клика на карту (переворот)
            el.onclick = (e) => {
                e.stopPropagation();
                if (el.classList.contains('flipped')) return;
                el.classList.add('flipped');
                haptic('impactOccurred', 'light');
                checkAllFlipped();
            };
            fanContainer.appendChild(el);
        });
    }

    // Клик по конверту
    envelope.onclick = () => {
        if (envelope.classList.contains('opened')) return;
        envelope.classList.add('opened');
        hint.style.display = 'none';
        haptic('impactOccurred', 'heavy');
        
        // Анимация веера
        const cards = fanContainer.querySelectorAll('.fan-card');
        const angles = [-25, 0, 25];
        const xOffsets = [-60, 0, 60];
        const yOffsets = [20, 0, 20];

        cards.forEach((card, i) => {
            setTimeout(() => {
                card.classList.add('revealed');
                card.style.transform = `translate(calc(-50% + ${xOffsets[i]}px), calc(-50% + ${yOffsets[i]}px)) rotate(${angles[i]}deg)`;
            }, i * 150); 
        });
        
        invalidateDeck(); // Кэш сбрасывается, карты уже в БД
    };

    // Проверка, открыты ли все карты
    function checkAllFlipped() {
        const total = currentPackCards.length;
        const flipped = fanContainer.querySelectorAll('.fan-card.flipped').length;
        
        if (flipped === total) {
            setTimeout(() => {
                collectBtn.style.display = 'block';
                haptic('notificationOccurred', 'success');
            }, 400);
        }
    }

    // Кнопка "Забрать карты"
    collectBtn.onclick = () => {
        packScreen.style.display = 'none';
        toast('Карты добавлены в коллекцию!');
        
        // Возвращаемся на вкладку "Коллекция"
        document.getElementById('tab-collection').click();
        
        // Перерисовываем колоду, чтобы новые карты появились
        import('./deck.js').then(m => m.renderDeckGrid());
    };
}