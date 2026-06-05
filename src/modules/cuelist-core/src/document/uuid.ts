// UUIDv7 helper — RFC 9562 §5.7, monotonic and time-sortable.
import { v7 as uuidv7Base } from 'uuid';
export const uuidv7 = (): string => uuidv7Base();
