import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Currency, ExchangeRate } from "@shared/schema";

interface CurrencyContextType {
  userCurrency: string;
  currencies: Currency[];
  exchangeRates: ExchangeRate[];
  convertPrice: (price: number, fromCurrency?: string) => number;
  formatPrice: (price: number, fromCurrency?: string) => string;
  getCurrencySymbol: (currencyCode: string) => string;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useQuery<{ preferredCurrency?: string }>({
    queryKey: ["/api/auth/user"],
  });

  const { data: currencies = [], isLoading: currenciesLoading } = useQuery<Currency[]>({
    queryKey: ["/api/currencies"],
  });

  const { data: exchangeRates = [], isLoading: ratesLoading } = useQuery<ExchangeRate[]>({
    queryKey: ["/api/exchange-rates"],
  });

  const userCurrency = user?.preferredCurrency || "USD";

  const value = useMemo(() => {
    const getCurrencySymbol = (currencyCode: string): string => {
      const currency = currencies.find((c) => c.code === currencyCode);
      return currency?.symbol || "$";
    };

    const convertPrice = (price: number, fromCurrency: string = "USD"): number => {
      if (fromCurrency === userCurrency) {
        return price;
      }

      const directRate = exchangeRates.find(
        (r) => r.fromCurrency === fromCurrency && r.toCurrency === userCurrency
      );
      if (directRate) {
        return price * parseFloat(directRate.rate);
      }

      const reverseRate = exchangeRates.find(
        (r) => r.fromCurrency === userCurrency && r.toCurrency === fromCurrency
      );
      if (reverseRate && parseFloat(reverseRate.rate) !== 0) {
        return price / parseFloat(reverseRate.rate);
      }

      return price;
    };

    const formatPrice = (price: number, fromCurrency: string = "USD"): string => {
      const convertedPrice = convertPrice(price, fromCurrency);
      const symbol = getCurrencySymbol(userCurrency);
      return `${symbol}${convertedPrice.toFixed(2)}`;
    };

    return {
      userCurrency,
      currencies,
      exchangeRates,
      convertPrice,
      formatPrice,
      getCurrencySymbol,
      isLoading: currenciesLoading || ratesLoading,
    };
  }, [userCurrency, currencies, exchangeRates, currenciesLoading, ratesLoading]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    return {
      userCurrency: "USD",
      currencies: [],
      exchangeRates: [],
      convertPrice: (price: number) => price,
      formatPrice: (price: number) => `$${price.toFixed(2)}`,
      getCurrencySymbol: () => "$",
      isLoading: false,
    };
  }
  return context;
}
