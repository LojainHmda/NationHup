export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isActive: boolean;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
}

export function convertPrice(
  price: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: ExchangeRate[]
): number {
  if (fromCurrency === toCurrency) {
    return price;
  }

  const directRate = exchangeRates.find(
    (r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency
  );
  if (directRate) {
    return price * parseFloat(directRate.rate);
  }

  const reverseRate = exchangeRates.find(
    (r) => r.fromCurrency === toCurrency && r.toCurrency === fromCurrency
  );
  if (reverseRate && parseFloat(reverseRate.rate) !== 0) {
    return price / parseFloat(reverseRate.rate);
  }

  return price;
}

export function formatPrice(
  price: number,
  currency: Currency | undefined,
  options?: { showCode?: boolean }
): string {
  const symbol = currency?.symbol || '$';
  const code = currency?.code || 'USD';
  const formattedPrice = price.toFixed(2);
  
  if (options?.showCode) {
    return `${symbol}${formattedPrice} ${code}`;
  }
  return `${symbol}${formattedPrice}`;
}

export function getCurrencySymbol(
  currencyCode: string,
  currencies: Currency[]
): string {
  const currency = currencies.find((c) => c.code === currencyCode);
  return currency?.symbol || '$';
}
