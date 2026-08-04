import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = 'auth:is-public-route';

/** Opts a route out of the globally applied `ClerkAuthGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
