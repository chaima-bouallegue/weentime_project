from __future__ import annotations

import functools
import inspect
from typing import Any, Callable, TypeVar, get_type_hints

from .tracing import start_span

F = TypeVar("F", bound=Callable[..., Any])


def trace_ai_step(step_name: str) -> Callable[[F], F]:
    def decorator(func: F) -> F:
        if hasattr(func, "__call__") and getattr(func, "__name__", ""):
            if getattr(func, "__code__", None) and func.__code__.co_flags & 0x80:
                @functools.wraps(func)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    with start_span(step_name):
                        return await func(*args, **kwargs)

                async_wrapper.__annotations__ = _resolved_annotations(func)
                async_wrapper.__signature__ = _resolved_signature(func, async_wrapper.__annotations__)  # type: ignore[attr-defined]
                return async_wrapper  # type: ignore[return-value]

            @functools.wraps(func)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                with start_span(step_name):
                    return func(*args, **kwargs)

            wrapper.__annotations__ = _resolved_annotations(func)
            wrapper.__signature__ = _resolved_signature(func, wrapper.__annotations__)  # type: ignore[attr-defined]
            return wrapper  # type: ignore[return-value]
        return func

    return decorator


def _resolved_annotations(func: Callable[..., Any]) -> dict[str, Any]:
    try:
        return get_type_hints(func)
    except Exception:
        return getattr(func, "__annotations__", {})


def _resolved_signature(func: Callable[..., Any], annotations: dict[str, Any]) -> inspect.Signature:
    signature = inspect.signature(func)
    parameters = []
    for name, parameter in signature.parameters.items():
        if name in annotations:
            parameter = parameter.replace(annotation=annotations[name])
        parameters.append(parameter)
    return_annotation = annotations.get("return", signature.return_annotation)
    return signature.replace(parameters=parameters, return_annotation=return_annotation)
