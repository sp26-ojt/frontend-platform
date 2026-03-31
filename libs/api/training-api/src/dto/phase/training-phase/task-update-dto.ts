export class TaskUpdateDTO {
    id: number;
    title: string;
    content: string;
    solution: string;
    answer: string;
    incorrect_answer_limit: number;
    modify_sandbox: boolean;
    dynamic_flag_enabled: boolean;
    dynamic_flag_interval_minutes: number | null;
    dynamic_flag_secret: string | null;
}
