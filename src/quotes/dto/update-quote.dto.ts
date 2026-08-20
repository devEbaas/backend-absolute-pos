import { CreateQuoteDto } from './create-quote.dto';

// Mismo shape que crear — el desktop reemplaza todos los items en cada
// edición en vez de diffear fila por fila (ver updateQuote en
// quotes.logic.js), y este endpoint replica ese mismo criterio.
export class UpdateQuoteDto extends CreateQuoteDto {}
