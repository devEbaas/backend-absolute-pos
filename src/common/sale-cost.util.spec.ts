import { saleUnitCost } from './sale-cost.util';

// DEC-002: el costo de la partida es el del producto vendido.
describe('saleUnitCost', () => {
  it('producto raíz: su propio costo', () => {
    expect(saleUnitCost({ purchaseCost: 12 })).toBe(12);
  });

  it('producto sin costo: 0, no se inventa', () => {
    expect(saleUnitCost({ purchaseCost: 0 })).toBe(0);
  });

  it('presentación: su propio costo, aunque sea 0 (no se toma el del padre)', () => {
    expect(saleUnitCost({ purchaseCost: 100 })).toBe(100);
    expect(saleUnitCost({ purchaseCost: 0 })).toBe(0);
  });
});
