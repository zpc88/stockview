import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { isValidUsername, isValidPassword } from '../utils/sanitize';

const { Title } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      navigate('/');
    } catch (error: any) {
      message.error(error.response?.data?.error || '登录失败');
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
          <Typography.Text type="secondary">实时行情看板</Typography.Text>
        </div>

        <Form name="login" onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[
            { required: true, message: '请输入用户名' },
            { validator: (_, val) => isValidUsername(val) ? Promise.resolve() : Promise.reject('用户名格式不正确') },
          ]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" maxLength={20} />
          </Form.Item>

          <Form.Item name="password" rules={[
            { required: true, message: '请输入密码' },
            { validator: (_, val) => isValidPassword(val) ? Promise.resolve() : Promise.reject('密码格式不正确') },
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" maxLength={50} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', marginTop: 16, color: '#999', fontSize: 12 }}>
            演示账号: demo / user123 &nbsp;|&nbsp; 管理员: admin / admin123
          </div>
        </Form>
      </Card>
    </div>
  );
}
