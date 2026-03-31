import {AbstractPhaseDTO} from '../abstract-phase-dto';

export interface TaskDTO extends AbstractPhaseDTO {
    answer: string;
    content: string;
    solution: string;
    incorrect_answer_limit: number;
    modify_sandbox: boolean;
    dynamic_flag_enabled: boolean;
    dynamic_flag_interval_minutes: number | null;
    dynamic_flag_secret: string | null;
}
