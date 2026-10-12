"""OpenAPI schema post-processing."""


def require_all_response_fields(result, generator, request, public):
    """Mark every property of response components as required.

    DRF serializers always render every declared field, but drf-spectacular only marks fields as
    required when they are read-only or required on input, so defaulted fields (e.g. ``status``)
    would wrongly appear optional in the generated client types. Request components (suffixed
    ``Request`` with COMPONENT_SPLIT_REQUEST) are left untouched.
    """
    for name, schema in result.get("components", {}).get("schemas", {}).items():
        if name.endswith("Request") or schema.get("type") != "object":
            continue
        if properties := schema.get("properties"):
            schema["required"] = sorted(properties)
    return result
