import { mobileRegisterId } from '../src/common/register-id.util';

// El formato del `registerId` de las cajas móviles (opción C): nombre + `#` + 4 caracteres del id, en mayúsculas.
describe('mobileRegisterId', () => {
  it('nombre + sufijo de 4 caracteres hexadecimales del id, en mayúsculas', () => {
    expect(
      mobileRegisterId({
        id: 'a1b2c3d4-0000-4000-8000-000000000000',
        label: 'CAJA-2',
      }),
    ).toBe('CAJA-2 #A1B2');
  });

  it('el mismo dispositivo siempre da el mismo valor y dos dispositivos con el mismo nombre dan valores distintos', () => {
    const a = { id: 'a1b2c3d4-0000-4000-8000-000000000000', label: 'CAJA-1' };
    const b = { id: 'ffee1122-0000-4000-8000-000000000000', label: 'CAJA-1' };
    expect(mobileRegisterId(a)).toBe(mobileRegisterId({ ...a }));
    expect(mobileRegisterId(a)).not.toBe(mobileRegisterId(b));
  });

  it('nunca es igual al nombre a secas (el `device_name` del escritorio)', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(mobileRegisterId({ id, label: 'CAJA-1' })).not.toBe('CAJA-1');
  });
});
