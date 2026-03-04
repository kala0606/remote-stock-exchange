(function () {
    const STORAGE_KEY = 'rse-dashboard-order';
    const DEFAULT_ORDER = [
        'activity-log', 'hand', 'portfolio', 'market', 'leaderboard-turn-order',
        'price-history', 'open-shorts', 'rights-offers', 'player-progress', 'deck-info'
    ];

    let draggedWidget = null;

    function getContainer() {
        return document.getElementById('dash-widgets');
    }

    function getWidgets() {
        const container = getContainer();
        return container ? Array.from(container.querySelectorAll('.dash-widget')) : [];
    }

    function saveDashboardOrder() {
        const ids = getWidgets().map(function (w) { return w.getAttribute('data-widget-id'); }).filter(Boolean);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        } catch (e) {}
    }

    function restoreDashboardOrder(order) {
        const container = getContainer();
        if (!container) return;
        const widgets = getWidgets();
        const byId = {};
        widgets.forEach(function (w) {
            const id = w.getAttribute('data-widget-id');
            if (id) byId[id] = w;
        });
        order.forEach(function (id) {
            if (byId[id]) container.appendChild(byId[id]);
        });
        widgets.forEach(function (w) {
            const id = w.getAttribute('data-widget-id');
            if (id && order.indexOf(id) === -1) container.appendChild(w);
        });
    }

    function restoreFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const order = JSON.parse(raw);
                if (Array.isArray(order) && order.length) restoreDashboardOrder(order);
                return;
            }
        } catch (e) {}
        restoreDashboardOrder(DEFAULT_ORDER);
    }

    function resetDashboardOrder() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        restoreDashboardOrder(DEFAULT_ORDER);
    }

    function initDashboardLayout() {
        const container = getContainer();
        if (!container) return;

        restoreFromStorage();

        var handles = container.querySelectorAll('.drag-handle');
        handles.forEach(function (handle) {
            var widget = handle.closest('.dash-widget');
            if (!widget) return;
            handle.setAttribute('draggable', 'true');

            handle.addEventListener('dragstart', function (e) {
                e.dataTransfer.setData('text/plain', widget.getAttribute('data-widget-id'));
                e.dataTransfer.effectAllowed = 'move';
                draggedWidget = widget;
                widget.classList.add('dragging');
            });

            handle.addEventListener('dragend', function () {
                if (draggedWidget) {
                    draggedWidget.classList.remove('dragging');
                    draggedWidget = null;
                }
                getWidgets().forEach(function (w) { w.classList.remove('drag-over'); });
            });
        });

        getWidgets().forEach(function (widget) {
            widget.addEventListener('dragover', function (e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedWidget && draggedWidget !== widget) widget.classList.add('drag-over');
            });

            widget.addEventListener('dragleave', function () {
                widget.classList.remove('drag-over');
            });

            widget.addEventListener('drop', function (e) {
                e.preventDefault();
                widget.classList.remove('drag-over');
                var id = e.dataTransfer.getData('text/plain');
                if (!id) return;
                var dragged = container.querySelector('.dash-widget[data-widget-id="' + id + '"]');
                if (!dragged || dragged === widget) return;
                container.insertBefore(dragged, widget);
                saveDashboardOrder();
            });
        });
        var resetBtn = document.getElementById('reset-layout-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () { resetDashboardOrder(); });
        }
    }

    window.initDashboardLayout = initDashboardLayout;
    window.resetDashboardOrder = resetDashboardOrder;
})();
