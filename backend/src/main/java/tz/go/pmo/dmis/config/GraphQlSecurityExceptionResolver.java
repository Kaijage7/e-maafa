package tz.go.pmo.dmis.config;

import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.schema.DataFetchingEnvironment;
import org.springframework.graphql.execution.DataFetcherExceptionResolverAdapter;
import org.springframework.graphql.execution.ErrorType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;

/** Stable client classifications for expected security failures; unexpected errors stay opaque. */
@Component
public class GraphQlSecurityExceptionResolver extends DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable exception, DataFetchingEnvironment environment) {
        if (exception instanceof AccessDeniedException) {
            return GraphqlErrorBuilder.newError(environment)
                    .errorType(ErrorType.FORBIDDEN)
                    .message("Access denied.")
                    .build();
        }
        if (exception instanceof AuthenticationException) {
            return GraphqlErrorBuilder.newError(environment)
                    .errorType(ErrorType.UNAUTHORIZED)
                    .message("Authentication is required.")
                    .build();
        }
        return null;
    }
}
