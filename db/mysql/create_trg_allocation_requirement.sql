DROP TRIGGER IF EXISTS trg_allocation_status_requirement;

CREATE TRIGGER trg_allocation_status_requirement
AFTER UPDATE ON resource_allocation
FOR EACH ROW
BEGIN
    DECLARE v_remaining INT DEFAULT 0;

    IF NEW.requirement_id IS NOT NULL
       AND NEW.allocation_status <> OLD.allocation_status THEN

        IF NEW.allocation_status = 'COMPLETED' THEN
            UPDATE transition_requirement
               SET status = 'FULFILLED'
             WHERE requirement_id = NEW.requirement_id
               AND status IN ('PENDING', 'ALLOCATED');

        ELSEIF NEW.allocation_status = 'CANCELLED' THEN
            SELECT COUNT(*) INTO v_remaining
              FROM resource_allocation
             WHERE requirement_id = NEW.requirement_id
               AND allocation_id <> NEW.allocation_id
               AND allocation_status IN ('ACTIVE', 'COMPLETED');

            IF v_remaining = 0 THEN
                UPDATE transition_requirement
                   SET status = 'PENDING'
                 WHERE requirement_id = NEW.requirement_id
                   AND status = 'ALLOCATED';
            END IF;
        END IF;
    END IF;
END