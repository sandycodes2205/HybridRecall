-- Automatically finalize a submission after its second completed review.
-- This trigger duplicates the decision logic from FinalizeDecision because
-- MySQL triggers cannot call a procedure that starts/commits a transaction.

DROP TRIGGER IF EXISTS trg_finalize_after_review;

DELIMITER $$

CREATE TRIGGER trg_finalize_after_review
AFTER INSERT ON Review
FOR EACH ROW
BEGIN
  DECLARE v_submission_id INT;
  DECLARE v_review_count INT;
  DECLARE v_average_score DECIMAL(4,2);
  DECLARE v_status VARCHAR(20);
  DECLARE v_next_status VARCHAR(20);

  SELECT ra.submission_id
    INTO v_submission_id
    FROM ReviewAssignment ra
   WHERE ra.assignment_id = NEW.assignment_id;

  SELECT s.status
    INTO v_status
    FROM Submission s
   WHERE s.submission_id = v_submission_id
   FOR UPDATE;

  SELECT COUNT(*), ROUND(AVG(r.score), 2)
    INTO v_review_count, v_average_score
    FROM Review r
    JOIN ReviewAssignment ra ON ra.assignment_id = r.assignment_id
   WHERE ra.submission_id = v_submission_id;

  IF v_review_count >= 2
     AND v_status NOT IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN') THEN
    SET v_next_status = IF(v_average_score >= 7.0, 'ACCEPTED', 'REJECTED');

    UPDATE Submission
       SET status = v_next_status,
           finalized_at = CURRENT_TIMESTAMP
     WHERE submission_id = v_submission_id;

    INSERT INTO AuditLog (submission_id, action, details)
    VALUES (
      v_submission_id,
      'DECISION_FINALIZED',
      CONCAT('Decision: ', v_next_status, '; average score: ', v_average_score)
    );
  END IF;
END$$

DELIMITER ;
