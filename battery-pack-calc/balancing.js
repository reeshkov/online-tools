/**
 * Модуль распределения и балансировки элементов 18650
 */

const BalancingCore = {
    /**
     * Распределяет ячейки по параллелям методом жадного выбора
     * @param {Array} cells - Массив объектов [{marker, capacity, ir}]
     * @param {number} sCount - Кол-во последовательных групп (S)
     * @param {number} pCount - Кол-во параллелей (P)
     * @returns {Object} { groups, unusedCells, delta }
     */
    balancePack(cells, sCount, pCount) {
        const totalRequired = sCount * pCount;

        // 1. Сортировка: сначала по убыванию емкости, при равенстве — по возрастанию IR (лучшие в начале)
        const sortedCells = [...cells].sort((a, b) => {
            if (b.capacity !== a.capacity) return b.capacity - a.capacity;
            return a.ir - b.ir;
        });

        // 2. Отбор нужного количества лучших банок и определение остатка
        const cellsToUse = sortedCells.slice(0, totalRequired);
        const unusedCells = sortedCells.slice(totalRequired);

        // 3. Создание пустых S-групп (ИСПРАВЛЕНО: добавлено явное объявление пустого массива [])
        const groups = Array.from({ length: sCount }, (_, i) => ({
            id: i + 1,
            cells: [], // Здесь был баг cells: 
            totalCapacity: 0
        }));

        // 4. Жадное распределение: на каждом шаге отдаем банку группе с наименьшей текущей емкостью
        cellsToUse.forEach(cell => {
            groups.sort((a, b) => a.totalCapacity - b.totalCapacity);
            groups[0].cells.push(cell); // ИСПРАВЛЕНО: берем именно первый (самый слабый) элемент массива
            groups[0].totalCapacity += cell.capacity;
        });

        // Возвращаем группам исходный хронологический порядок (от S1 до Sn)
        groups.sort((a, b) => a.id - b.id);

        // 5. Расчет разброса емкостей (Delta)
        const capacities = groups.map(g => g.totalCapacity);
        const delta = Math.max(...capacities) - Math.min(...capacities);

        return {
            groups: groups,
            unusedCells: unusedCells,
            delta: delta
        };
    },

    /**
     * Рассчитывает эквивалентное внутреннее сопротивление параллели (1 / (1/r1 + 1/r2 + ...))
     * @param {Array} groupCells - Массив ячеек в параллели
     * @returns {number} Приблизительное сопротивление в мОм
     */
    calculateApproxIr(groupCells) {
        let invIrSum = 0;
        groupCells.forEach(c => {
            if (c.ir && c.ir > 0) invIrSum += (1 / c.ir);
        });
        return invIrSum > 0 ? Math.round(1 / invIrSum) : 0;
    }
};
