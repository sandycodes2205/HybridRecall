-- Migration for withdrawable submissions.
ALTER TABLE Submission
  MODIFY status ENUM('SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED','WITHDRAWN')
  NOT NULL DEFAULT 'SUBMITTED';

DROP PROCEDURE IF EXISTS FinalizeDecision;
DROP TRIGGER IF EXISTS trg_finalize_after_review;

DELIMITER $$

CREATE PROCEDURE FinalizeDecision(IN p_submission_id INT)
BEGIN
  DECLARE review_count INT; DECLARE average_score DECIMAL(4,2); DECLARE next_status VARCHAR(20); DECLARE current_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT status INTO current_status FROM Submission WHERE submission_id=p_submission_id FOR UPDATE;
  IF current_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Submission not found'; END IF;
  IF current_status IN ('ACCEPTED','REJECTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Submission is already finalized'; END IF;
  IF current_status = 'WITHDRAWN' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Submission is withdrawn'; END IF;
  SELECT COUNT(*), AvgScore(p_submission_id) INTO review_count, average_score FROM Review r JOIN ReviewAssignment ra ON ra.assignment_id=r.assignment_id WHERE ra.submission_id=p_submission_id;
  IF review_count < 2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='At least two submitted reviews are required'; END IF;
  SET next_status = IF(average_score >= 7.0, 'ACCEPTED', 'REJECTED');
  UPDATE Submission SET status=next_status, finalized_at=CURRENT_TIMESTAMP WHERE submission_id=p_submission_id;
  INSERT INTO AuditLog(submission_id, action, details) VALUES(p_submission_id, 'DECISION_FINALIZED', CONCAT('Decision: ', next_status, '; average score: ', average_score));
  COMMIT;
  SELECT next_status AS decision, average_score;
END$$

CREATE TRIGGER trg_finalize_after_review
AFTER INSERT ON Review
FOR EACH ROW
BEGIN
  DECLARE v_submission_id INT; DECLARE v_review_count INT; DECLARE v_average_score DECIMAL(4,2); DECLARE v_status VARCHAR(20); DECLARE v_next_status VARCHAR(20);
  SELECT ra.submission_id INTO v_submission_id FROM ReviewAssignment ra WHERE ra.assignment_id = NEW.assignment_id;
  SELECT s.status INTO v_status FROM Submission s WHERE s.submission_id = v_submission_id FOR UPDATE;
  SELECT COUNT(*), ROUND(AVG(r.score), 2) INTO v_review_count, v_average_score FROM Review r JOIN ReviewAssignment ra ON ra.assignment_id = r.assignment_id WHERE ra.submission_id = v_submission_id;
  IF v_review_count >= 2 AND v_status NOT IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN') THEN
    SET v_next_status = IF(v_average_score >= 7.0, 'ACCEPTED', 'REJECTED');
    UPDATE Submission SET status = v_next_status, finalized_at = CURRENT_TIMESTAMP WHERE submission_id = v_submission_id;
    INSERT INTO AuditLog (submission_id, action, details) VALUES (v_submission_id, 'DECISION_FINALIZED', CONCAT('Decision: ', v_next_status, '; average score: ', v_average_score));
  END IF;
END$$

DELIMITER ;
