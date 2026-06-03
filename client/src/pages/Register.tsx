import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, SmileOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { isValidUsername, isValidPassword, isValidNickname } from '../utils/sanitize';

const { Title } = Typography;

export default function Register() {
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string; nickname: string }) => {
    setLoading(true);
    try {
      await register(values.username, values.password, values.nickname);
      message.success('注册成功');
      navigate('/');
    } catch (error: any) {
      message.error(error.response?.data?.error || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card style={{ width: 400, borderRadius: 12 }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0, color: '#1677ff' }}>
            StockView
          </Title>
          <Typography.Text type="secondary">创建账号</Typography.Text>
        </div>

        <Form name="register" onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[
            { required: true, message: '请输入用户名' },
            { validator: (_, val) => isValidUsername(val) ? Promise.resolve() : Promise.reject('3-20个字符，只允许字母、数字、中文、下划线') },
          ]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" maxLength={20} />
          </Form.Item>

          <Form.Item name="nickname" rules={[
            { required: true, message: '请输入昵称' },
            { validator: (_, val) => isValidNickname(val) ? Promise.resolve() : Promise.reject('1-20个字符，不允许特殊字符') },
          ]}>
            <Input prefix={<SmileOutlined />} placeholder="昵称" maxLength={20} />
          </Form.Item>

          <Form.Item name="password" rules={[
            { required: true, message: '请输入密码' },
            { validator: (_, val) => isValidPassword(val) ? Promise.resolve() : Promise.reject('6-50个字符，不允许空格和<>') },
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" maxLength={50} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注册
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <span>已有账号? </span>
            <Link to="/login">去登录</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
