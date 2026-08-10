import * as formValidation from './formValidation';

describe('formValidation', () => {
  it('rejects empty product names', () => {
    const result = formValidation.validateProductForm({ name: '   ', price: '10', costPrice: '5', stock: '2' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Product name is required');
  });

  it('does not expose service validation helpers', () => {
    expect('validateServiceForm' in formValidation).toBe(false);
  });
});
