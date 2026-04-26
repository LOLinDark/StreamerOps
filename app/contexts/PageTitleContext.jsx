import { createContext, useContext } from 'react';

const PageTitleContext = createContext({ setPageTitle: () => {} });

export const PageTitleProvider = PageTitleContext.Provider;
export const usePageTitle = () => useContext(PageTitleContext);
