export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _encryption_key: {
        Row: {
          id: number
          key: string
        }
        Insert: {
          id?: number
          key: string
        }
        Update: {
          id?: number
          key?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json | null
          project_id: string | null
          task_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          project_id?: string | null
          task_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          project_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          agency_name: string
          id: number
          reminder_lead_days: number
          signups_enabled: boolean
          updated_at: string
        }
        Insert: {
          agency_name?: string
          id?: number
          reminder_lead_days?: number
          signups_enabled?: boolean
          updated_at?: string
        }
        Update: {
          agency_name?: string
          id?: number
          reminder_lead_days?: number
          signups_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_domains: {
        Row: {
          client_name: string
          created_at: string
          created_by: string | null
          customer_type: string
          domain: string
          domain_expiry: string | null
          hosting_expiry: string | null
          id: string
          notes: string | null
          provider: string | null
          renewed: boolean
          updated_at: string
        }
        Insert: {
          client_name: string
          created_at?: string
          created_by?: string | null
          customer_type?: string
          domain: string
          domain_expiry?: string | null
          hosting_expiry?: string | null
          id?: string
          notes?: string | null
          provider?: string | null
          renewed?: boolean
          updated_at?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string | null
          customer_type?: string
          domain?: string
          domain_expiry?: string | null
          hosting_expiry?: string | null
          id?: string
          notes?: string | null
          provider?: string | null
          renewed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      credential_reveal_log: {
        Row: {
          actor_id: string
          credential_id: string
          id: string
          revealed_at: string
        }
        Insert: {
          actor_id: string
          credential_id: string
          id?: string
          revealed_at?: string
        }
        Update: {
          actor_id?: string
          credential_id?: string
          id?: string
          revealed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_reveal_log_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "project_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_assignees: {
        Row: {
          domain_id: string
          user_id: string
        }
        Insert: {
          domain_id: string
          user_id: string
        }
        Update: {
          domain_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_assignees_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "client_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_reminder_state: {
        Row: {
          domain_id: string
          last_sent_at: string | null
          next_due_at: string | null
        }
        Insert: {
          domain_id: string
          last_sent_at?: string | null
          next_due_at?: string | null
        }
        Update: {
          domain_id?: string
          last_sent_at?: string | null
          next_due_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_reminder_state_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "client_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          password_encrypted: string | null
          project_id: string
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          password_encrypted?: string | null
          project_id: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          password_encrypted?: string | null
          project_id?: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_at: string
          added_by: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          icon: string
          id: string
          name: string
          owner_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          client_name?: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          icon?: string
          id?: string
          name: string
          owner_id: string
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          client_name?: string
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          icon?: string
          id?: string
          name?: string
          owner_id?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      sprints: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          goal: string | null
          id: string
          name: string
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["sprint_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          assigned_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          id: string
          position: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          position?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          mentions: string[]
          task_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string | null
          task_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          task_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          task_id?: string
          url?: string
        }
        Relationships: []
      }
      task_template_items: {
        Row: {
          created_at: string
          default_due_offset_days: number | null
          default_priority: Database["public"]["Enums"]["task_priority"]
          description: string | null
          id: string
          position: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          default_due_offset_days?: number | null
          default_priority?: Database["public"]["Enums"]["task_priority"]
          description?: string | null
          id?: string
          position?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          default_due_offset_days?: number | null
          default_priority?: Database["public"]["Enums"]["task_priority"]
          description?: string | null
          id?: string
          position?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          board_position: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_backlog: boolean
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          sprint_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          board_position?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_backlog?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          sprint_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          board_position?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_backlog?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          sprint_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_sprint: { Args: { _sprint_id: string }; Returns: undefined }
      apply_task_template: {
        Args: { _project_id: string; _start_date: string; _template_id: string }
        Returns: number
      }
      complete_sprint: { Args: { _sprint_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated: { Args: never; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reveal_credential_password: {
        Args: { _credential_id: string }
        Returns: string
      }
      save_credential_password: {
        Args: { _credential_id: string; _password: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "member"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "archived"
      service_type:
        | "website"
        | "seo"
        | "hosting"
        | "maintenance"
        | "branding"
        | "other"
      sprint_status: "planned" | "active" | "completed"
      task_priority: "low" | "medium" | "high"
      task_status: "todo" | "in_progress" | "in_review" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "archived",
      ],
      service_type: [
        "website",
        "seo",
        "hosting",
        "maintenance",
        "branding",
        "other",
      ],
      sprint_status: ["planned", "active", "completed"],
      task_priority: ["low", "medium", "high"],
      task_status: ["todo", "in_progress", "in_review", "done"],
    },
  },
} as const
