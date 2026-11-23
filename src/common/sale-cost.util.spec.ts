import { saleUnitCost } from './sale-cost.util';

describe('saleUnitCost', () => {
  it('producto raíz: su propio costo', () => {
    expect(saleUnitCost({ purchaseCost: 12, unitsPerPack: 1 }, null)).toBe(12);
  });

  it('producto raíz sin costo: 0, no se inventa', () => {
    expect(saleUnitCost({ purchaseCost: 0, unitsPerPack: 1 }, null)).toBe(0);
  });

  it('presentación con costo propio: manda el suyo, no el del padre', () => {
    expect(
      saleUnitCost(
        { purchaseCost: 100, unitsPerPack: 12 },
        { purchaseCost: 9, unitsPerPack: 1 },
      ),
    ).toBe(100);
  });

  it('presentación sin costo: padre × unidades por paquete', () => {
    expect(
      saleUnitCost(
        { purchaseCost: 0, unitsPerPack: 12 },
        { purchaseCost: 9, unitsPerPack: 1 },
      ),
    ).toBe(108);
  });

  it('presentación y padre sin costo: 0', () => {
    expect(
      saleUnitCost(
        { purchaseCost: 0, unitsPerPack: 12 },
        { purchaseCost: 0, unitsPerPack: 1 },
      ),
    ).toBe(0);
  });
});
