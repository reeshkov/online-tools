/**
 * Модуль распределения и балансировки элементов 18650 (BalancingCore.js)
 *
 * Алгоритм:
 * 1. Сортировка и отбор лучших ячеек (максимальная емкость, минимальное IR).
 * 2. Первичное жадное распределение со строгим лимитом P ячеек на группу.
 * 3. Локальная оптимизация (парный обмен 2-opt) для минимизации разброса емкости
 *    и выравнивания внутреннего сопротивления между параллелями.
 */
const BalancingCore = {
    /**
     * Распределяет ячейки по последовательным группам (S) и параллелям (P)
     *
     * @param {Array<Object>} cells - Массив ячеек [{ marker, capacity, ir }]
     * @param {number} sCount - Количество последовательных групп (S)
     * @param {number} pCount - Количество ячеек в каждой параллели (P)
     * @param {Object} [options] - Дополнительные параметры
     * @param {number} [options.maxIterations=500] - Лимит итераций локального поиска
     * @param {Array<number>} [options.hotGroupIds=[]] - Номера групп (1..S), прилегающих к источникам тепла (например, BMS)
     * @returns {Object} Результат балансировки и сводная статистика
     */
    balancePack(cells, sCount, pCount, options = {}) {
        const totalRequired = sCount * pCount;
        const maxIterations = options.maxIterations ?? 500;
        const hotSet = new Set(options.hotGroupIds || []);

        if (!Number.isInteger(sCount) || sCount < 1 || !Number.isInteger(pCount) || pCount < 1) {
            throw new Error('Параметры sCount и pCount должны быть целыми числами больше 0.');
        }

        if (!Array.isArray(cells) || cells.length < totalRequired) {
            throw new Error(
                `Недостаточно ячеек для сборки ${sCount}S${pCount}P: требуется ${totalRequired}, передано ${cells ? cells.length : 0}.`
            );
        }

        // 1. Нормализация входных данных и сортировка (емкие с низким IR — первыми)
        const sortedCells = cells
            .map((cell, index) => ({
                ...cell,
                marker: cell.marker ?? `#${index + 1}`,
                capacity: Number(cell.capacity) || 0,
                ir: Number(cell.ir) || 0
            }))
            .sort((a, b) => {
                if (b.capacity !== a.capacity) return b.capacity - a.capacity;
                return a.ir - b.ir;
            });

        const cellsToUse = sortedCells.slice(0, totalRequired);
        const unusedCells = sortedCells.slice(totalRequired);

        // 2. Инициализация S-групп
        const groups = Array.from({ length: sCount }, (_, i) => ({
            id: i + 1,
            isHot: hotSet.has(i + 1),
            cells: [],
            totalCapacity: 0,
            approxIr: 0
        }));

        // 3. Этап 1: Начальное жадное распределение
        cellsToUse.forEach(cell => {
            const availableGroups = groups.filter(g => g.cells.length < pCount);

            availableGroups.sort((a, b) => {
                if (a.totalCapacity !== b.totalCapacity) {
                    return a.totalCapacity - b.totalCapacity;
                }
                if (hotSet.size > 0 && a.isHot !== b.isHot) {
                    return a.isHot ? -1 : 1;
                }
                return b.approxIr - a.approxIr;
            });

            const targetGroup = availableGroups[0];
            targetGroup.cells.push(cell);
            targetGroup.totalCapacity += cell.capacity;
            targetGroup.approxIr = this.calculateApproxIr(targetGroup.cells);
        });

        const initialDelta = this.calculateDeltaCapacity(groups);

        // 4. Этап 2: Локальная оптимизация (парные обмены)
        const iterations = this.optimizeGroups(groups, maxIterations, hotSet.size > 0);

        // 5. Финальный пересчет показателей и упорядочивание
        groups.forEach(group => {
            group.approxIr = this.calculateApproxIr(group.cells);
            group.cells.sort((a, b) => b.capacity - a.capacity || a.ir - b.ir);
        });
        groups.sort((a, b) => a.id - b.id);

        const capacities = groups.map(g => g.totalCapacity);
        const irs = groups.map(g => g.approxIr);

        return {
            groups,
            unusedCells,
            initialDelta,
            deltaCapacity: Math.max(...capacities) - Math.min(...capacities),
            deltaIr: Number((Math.max(...irs) - Math.min(...irs)).toFixed(2)),
            minGroupCapacity: Math.min(...capacities),
            maxGroupCapacity: Math.max(...capacities),
            iterations
        };
    },

    /**
     * Алгоритм локальной оптимизации методом парного обмена (2-opt)
     *
     * @param {Array<Object>} groups - Массив групп (мутируется на месте)
     * @param {number} maxIterations - Максимальное число перестановок
     * @param {boolean} hasHotZones - Режим концентрации низкого IR в hot-группах
     * @returns {number} Количество выполненных обменов
     */
    optimizeGroups(groups, maxIterations = 500, hasHotZones = false) {
        if (groups.length < 2) return 0;

        let swapsCount = 0;

        for (let iter = 0; iter < maxIterations; iter++) {
            let bestSwap = null;
            let bestScore = 0;

            for (let gA = 0; gA < groups.length; gA++) {
                for (let gB = gA + 1; gB < groups.length; gB++) {
                    const groupA = groups[gA];
                    const groupB = groups[gB];
                    const oldPairDiff = Math.abs(groupA.totalCapacity - groupB.totalCapacity);

                    for (let i = 0; i < groupA.cells.length; i++) {
                        for (let j = 0; j < groupB.cells.length; j++) {
                            const cellA = groupA.cells[i];
                            const cellB = groupB.cells[j];

                            const newCapA = groupA.totalCapacity - cellA.capacity + cellB.capacity;
                            const newCapB = groupB.totalCapacity - cellB.capacity + cellA.capacity;
                            const newPairDiff = Math.abs(newCapA - newCapB);

                            const capImprovement = oldPairDiff - newPairDiff;
                            if (capImprovement < 0) continue;

                            let irImprovement = 0;

                            if (hasHotZones) {
                                // Приоритет переноса ячеек с низким IR в локально нагреваемые группы
                                if (groupA.isHot && !groupB.isHot) {
                                    irImprovement = cellA.ir - cellB.ir;
                                } else if (groupB.isHot && !groupA.isHot) {
                                    irImprovement = cellB.ir - cellA.ir;
                                }
                            } else {
                                // Стандартный режим: выравнивание эквивалентного IR между параллелями
                                const oldIrDiff = Math.abs(groupA.approxIr - groupB.approxIr);

                                const nextCellsA = [...groupA.cells];
                                const nextCellsB = [...groupB.cells];
                                nextCellsA[i] = cellB;
                                nextCellsB[j] = cellA;

                                const newIrDiff = Math.abs(
                                    this.calculateApproxIr(nextCellsA) - this.calculateApproxIr(nextCellsB)
                                );
                                irImprovement = oldIrDiff - newIrDiff;
                            }

                            if (capImprovement > 0 || (capImprovement === 0 && irImprovement > 0.01)) {
                                const score = capImprovement * 1000 + irImprovement;

                                if (score > bestScore) {
                                    bestScore = score;
                                    bestSwap = { groupA, groupB, idxA: i, idxB: j };
                                }
                            }
                        }
                    }
                }
            }

            if (!bestSwap) break;

            const { groupA, groupB, idxA, idxB } = bestSwap;
            const tempCell = groupA.cells[idxA];

            groupA.cells[idxA] = groupB.cells[idxB];
            groupB.cells[idxB] = tempCell;

            groupA.totalCapacity = groupA.cells.reduce((sum, c) => sum + c.capacity, 0);
            groupB.totalCapacity = groupB.cells.reduce((sum, c) => sum + c.capacity, 0);
            groupA.approxIr = this.calculateApproxIr(groupA.cells);
            groupB.approxIr = this.calculateApproxIr(groupB.cells);

            swapsCount++;
        }

        return swapsCount;
    },

    /**
     * Вычисляет разницу емкостей между самой сильной и самой слабой группой
     *
     * @param {Array<Object>} groups
     * @returns {number} Разброс в мА·ч
     */
    calculateDeltaCapacity(groups) {
        const capacities = groups.map(g => g.totalCapacity);
        return Math.max(...capacities) - Math.min(...capacities);
    },

    /**
     * Рассчитывает эквивалентное внутреннее сопротивление параллельного соединения:
     * R_eq = 1 / (1/R1 + 1/R2 + ... + 1/Rn)
     *
     * @param {Array<Object>} groupCells - Массив ячеек в параллели
     * @returns {number} Сопротивление в мОм (до 2 знаков после запятой)
     */
    calculateApproxIr(groupCells) {
        let invIrSum = 0;
        for (let i = 0; i < groupCells.length; i++) {
            const ir = groupCells[i].ir;
            if (ir && ir > 0) {
                invIrSum += 1 / ir;
            }
        }
        return invIrSum > 0 ? Number((1 / invIrSum).toFixed(2)) : 0;
    }
};

// Поддержка экспорта для Node.js / сборщиков (CommonJS / ES Modules) и глобальной области браузера
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BalancingCore;
}
