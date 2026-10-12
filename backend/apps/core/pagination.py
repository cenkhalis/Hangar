"""API pagination."""

from rest_framework.pagination import PageNumberPagination

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


class StandardPagination(PageNumberPagination):
    """Page-number pagination with an opt-in ``page_size``.

    ``page_size=1`` lets clients read a filtered ``count`` (e.g. dashboard KPIs) without
    downloading a full page of records.
    """

    page_size = DEFAULT_PAGE_SIZE
    page_size_query_param = "page_size"
    max_page_size = MAX_PAGE_SIZE
