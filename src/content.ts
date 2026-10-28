import { installTemuProductSearch } from './temu-product-search';

if (/^https:\/\/www\.temu\.com\//i.test(location.href)) installTemuProductSearch();
