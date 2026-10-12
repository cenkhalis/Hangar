from apps.core.exceptions import DomainError


class MaintenanceError(DomainError):
    code = "maintenance_error"


class TaskNotInProgram(MaintenanceError):
    code = "task_not_in_program"


class DuplicateOpenTask(MaintenanceError):
    code = "duplicate_open_task"


class EmptyWorkOrder(MaintenanceError):
    code = "empty_work_order"


class WorkOrderNotOpen(MaintenanceError):
    code = "work_order_not_open"


class ItemNotPending(MaintenanceError):
    code = "item_not_pending"


class InvalidTimestamp(MaintenanceError):
    code = "invalid_timestamp"


class MissingReason(MaintenanceError):
    code = "missing_reason"


class MissingPerformer(MaintenanceError):
    code = "missing_performer"


class CompletionAlreadyVoided(MaintenanceError):
    code = "completion_already_voided"
