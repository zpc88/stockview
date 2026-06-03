import { useState, useEffect } from 'react';
import { Table, Select, Button, Popconfirm, message, Modal, Form, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined, KeyOutlined } from '@ant-design/icons';
import { userApi } from '../services/api';
import { User } from '../types';
import { isValidUsername, isValidPassword, isValidNickname } from '../utils/sanitize';

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetForm] = Form.useForm();
  const [resetSaving, setResetSaving] = useState(false);

  const loadUsers = async () => {
    try {
      const data = await userApi.getAll();
      setUsers(data);
    } catch {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async (id: number, role: string) => {
    try {
      await userApi.updateRole(id, role);
      message.success('角色已更新');
      loadUsers();
    } catch {
      message.error('更新失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userApi.delete(id);
      message.success('用户已删除');
      loadUsers();
    } catch {
      message.error('删除失败');
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditSaving(true);
      await userApi.update(editingUser!.id, values);
      message.success('用户信息已更新');
      setEditingUser(null);
      editForm.resetFields();
      loadUsers();
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      setResetSaving(true);
      await userApi.resetPassword(resetUser!.id, values.newPassword);
      message.success('密码已重置');
      setResetUser(null);
      resetForm.resetFields();
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      }
    } finally {
      setResetSaving(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await userApi.create(values);
      message.success('用户创建成功');
      setShowCreate(false);
      form.resetFields();
      loadUsers();
    } catch (error: any) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      }
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '昵称', dataIndex: 'nickname' },
    {
      title: '角色',
      dataIndex: 'role',
      render: (role: string, record: User) => (
        <Select
          value={role}
          size="small"
          style={{ width: 100 }}
          onChange={(value) => handleRoleChange(record.id, value)}
          options={[
            { label: '管理员', value: 'ADMIN' },
            { label: '普通用户', value: 'USER' },
          ]}
        />
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      render: (_: any, record: User) => (
        <Space size={4}>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => {
              setEditingUser(record);
              editForm.setFieldsValue({ username: record.username, nickname: record.nickname });
            }}
          >
            编辑
          </Button>
          <Button
            type="text"
            icon={<KeyOutlined />}
            size="small"
            onClick={() => {
              setResetUser(record);
              resetForm.resetFields();
            }}
          >
            改密
          </Button>
          <Popconfirm
            title="确定删除此用户?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: '#999' }}>共 {users.length} 个用户</span>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setShowCreate(true)}>
          创建用户
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
      />

      <Modal
        title="创建新用户"
        open={showCreate}
        onCancel={() => {
          setShowCreate(false);
          form.resetFields();
        }}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ role: 'USER' }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { validator: (_, val) => isValidUsername(val) ? Promise.resolve() : Promise.reject('3-20个字符，只允许字母、数字、中文、下划线') },
            ]}
          >
            <Input placeholder="3-20个字符" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[
              { required: true, message: '请输入昵称' },
              { validator: (_, val) => isValidNickname(val) ? Promise.resolve() : Promise.reject('1-20个字符，不允许特殊字符') },
            ]}
          >
            <Input placeholder="显示名称" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { validator: (_, val) => isValidPassword(val) ? Promise.resolve() : Promise.reject('6-50个字符，不允许空格和<>') },
            ]}
          >
            <Input.Password placeholder="6-50个字符" maxLength={50} />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { label: '普通用户', value: 'USER' },
                { label: '管理员', value: 'ADMIN' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户信息弹窗 */}
      <Modal
        title={`编辑用户 - ${editingUser?.username}`}
        open={!!editingUser}
        onCancel={() => { setEditingUser(null); editForm.resetFields(); }}
        onOk={handleEdit}
        confirmLoading={editSaving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { validator: (_, val) => isValidUsername(val) ? Promise.resolve() : Promise.reject('3-20个字符，只允许字母、数字、中文、下划线') },
            ]}
          >
            <Input placeholder="3-20个字符" maxLength={20} />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[
              { required: true, message: '请输入昵称' },
              { validator: (_, val) => isValidNickname(val) ? Promise.resolve() : Promise.reject('1-20个字符，不允许特殊字符') },
            ]}
          >
            <Input placeholder="显示名称" maxLength={20} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={`重置密码 - ${resetUser?.username}`}
        open={!!resetUser}
        onCancel={() => { setResetUser(null); resetForm.resetFields(); }}
        onOk={handleResetPassword}
        confirmLoading={resetSaving}
        okText="重置"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { validator: (_, val) => isValidPassword(val) ? Promise.resolve() : Promise.reject('6-50个字符，不允许空格和<>') },
            ]}
          >
            <Input.Password placeholder="6-50个字符" maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
